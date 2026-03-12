import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execFileAsync = promisify(execFile);

export interface DeviceInfo {
    serial: string;
    name: string;
    type: 'emulator' | 'device';
    state: string;
}

export class AdbManager {
    private readonly adbPath: string;
    private readonly emulatorPath: string;
    private activeDevice: string | undefined;

    constructor() {
        const sdk = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'] ?? '';
        const isWin = process.platform === 'win32';
        this.adbPath = sdk
            ? path.join(sdk, 'platform-tools', isWin ? 'adb.exe' : 'adb')
            : 'adb';
        this.emulatorPath = sdk
            ? path.join(sdk, 'emulator', isWin ? 'emulator.exe' : 'emulator')
            : 'emulator';
    }

    // ------------------------------------------------------------------ //
    //  Helpers
    // ------------------------------------------------------------------ //

    private async exec(...args: string[]): Promise<string> {
        const { stdout } = await execFileAsync(this.adbPath, args, { timeout: 30_000 });
        return stdout.trim();
    }

    // ------------------------------------------------------------------ //
    //  Device management
    // ------------------------------------------------------------------ //

    async listDevices(): Promise<DeviceInfo[]> {
        const output = await this.exec('devices', '-l');
        const lines = output.split('\n').slice(1).filter(Boolean);

        return lines
            .filter((line) => !line.startsWith('*'))
            .map((line) => {
                const parts = line.split(/\s+/);
                const serial = parts[0] ?? '';
                const state = parts[1] ?? 'unknown';
                const modelMatch = line.match(/model:(\S+)/);
                const name = modelMatch
                    ? modelMatch[1].replace(/_/g, ' ')
                    : serial;
                return {
                    serial,
                    name,
                    state,
                    type: serial.startsWith('emulator') ? 'emulator' : 'device',
                } as DeviceInfo;
            });
    }

    setActiveDevice(serial: string): void {
        this.activeDevice = serial;
    }

    getActiveDevice(): string | undefined {
        return this.activeDevice;
    }

    // ------------------------------------------------------------------ //
    //  Emulator
    // ------------------------------------------------------------------ //

    async listAvds(): Promise<string[]> {
        const { stdout } = await execFileAsync(this.emulatorPath, ['-list-avds'], { timeout: 10_000 });
        return stdout.trim().split('\n').filter(Boolean);
    }

    startEmulator(avdName: string): Promise<void> {
        // Headless: no GUI window, no audio
        const child = spawn(
            this.emulatorPath,
            ['-avd', avdName, '-no-window', '-no-audio', '-no-boot-anim'],
            { detached: true, stdio: 'ignore' }
        );
        child.unref();
        return Promise.resolve();
    }

    // ------------------------------------------------------------------ //
    //  Wi-Fi
    // ------------------------------------------------------------------ //

    async connectWifi(address: string): Promise<void> {
        const output = await this.exec('connect', address);
        if (!output.toLowerCase().includes('connected')) {
            throw new Error(output || `Could not connect to ${address}`);
        }
    }

    /** ADB 11+ wireless pairing: `adb pair <address> <code>` */
    async pairDevice(address: string, code: string): Promise<void> {
        const output = await this.exec('pair', address, code);
        if (!output.toLowerCase().includes('successfully paired')) {
            throw new Error(output || `Could not pair with ${address}`);
        }
    }

    /**
     * Waits for a newly launched emulator to finish booting.
     * Pass the set of serials that existed *before* `startEmulator()` was called;
     * this method detects the new `emulator-XXXX` serial and polls
     * `sys.boot_completed` until it equals `"1"`.
     * Resolves with the new serial, or rejects after 120 s.
     */
    async waitForBoot(knownSerials: string[]): Promise<string> {
        const TIMEOUT_MS = 120_000;
        const POLL_MS = 2_000;
        const deadline = Date.now() + TIMEOUT_MS;

        // Step 1 — wait for new emulator serial to appear
        let newSerial: string | undefined;
        while (!newSerial) {
            if (Date.now() > deadline) {
                throw new Error('Timed out waiting for emulator to appear in adb devices.');
            }
            const all = await this.listDevices();
            newSerial = all
                .filter((d) => d.serial.startsWith('emulator-'))
                .find((d) => !knownSerials.includes(d.serial))
                ?.serial;
            if (!newSerial) await sleep(POLL_MS);
        }

        // Step 2 — wait for sys.boot_completed == "1"
        while (Date.now() < deadline) {
            try {
                const val = await this.exec('-s', newSerial, 'shell', 'getprop', 'sys.boot_completed');
                if (val.trim() === '1') return newSerial;
            } catch {
                // device not ready yet; keep polling
            }
            await sleep(POLL_MS);
        }
        throw new Error('Timed out waiting for emulator boot to complete.');
    }

    // ------------------------------------------------------------------ //
    //  App control
    // ------------------------------------------------------------------ //

    async firstOnlineDevice(): Promise<string | undefined> {
        const all = await this.listDevices();
        return all.find((d) => d.state === 'device')?.serial;
    }

    async launch(serial: string, packageName?: string): Promise<void> {
        const pkg = packageName ?? await this.detectPackage();
        // adb shell monkey with 0 events is the most reliable cold-start trigger:
        //   adb shell am start -n pkg/.MainActivity  (fallback if monkey unavailable)
        try {
            await this.exec(
                '-s', serial, 'shell', 'am', 'start',
                '-a', 'android.intent.action.MAIN',
                '-c', 'android.intent.category.LAUNCHER',
                pkg
            );
        } catch {
            // Fallback: conventional component name
            const component = `${pkg}/.MainActivity`;
            await this.exec('-s', serial, 'shell', 'am', 'start', '-n', component);
        }
    }

    /**
     * Detect the Android application package name from AndroidManifest.xml.
     * Looks in common locations relative to `projectPath`.
     */
    async detectPackage(projectPath?: string): Promise<string> {
        if (!projectPath) {
            throw new Error(
                'Set "nanoDrift.packageName" in VS Code settings or open an Android project.'
            );
        }
        const candidates = [
            path.join(projectPath, 'app', 'src', 'main', 'AndroidManifest.xml'),
            path.join(projectPath, 'src', 'main', 'AndroidManifest.xml'),
            path.join(projectPath, 'AndroidManifest.xml'),
        ];
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                const content = fs.readFileSync(candidate, 'utf-8');
                // Match: package="com.example.myapp" or package='com.example.myapp'
                const match = content.match(/package\s*=\s*["']([^"']+)["']/);
                if (match?.[1]) return match[1];
            }
        }
        throw new Error(
            'Could not detect package name from AndroidManifest.xml. ' +
            'Set "nanoDrift.packageName" in VS Code settings.'
        );
    }

    // ------------------------------------------------------------------ //
    //  Input
    // ------------------------------------------------------------------ //

    async tap(serial: string, x: number, y: number): Promise<void> {
        await this.exec('-s', serial, 'shell', 'input', 'tap', String(x), String(y));
    }

    async swipe(
        serial: string,
        x1: number, y1: number,
        x2: number, y2: number,
        durationMs = 200
    ): Promise<void> {
        await this.exec(
            '-s', serial, 'shell', 'input', 'swipe',
            String(x1), String(y1), String(x2), String(y2), String(durationMs)
        );
    }

    /**
     * Send a printable text string to the active device.
     * Spaces are encoded as `%s` per the `adb shell input text` convention.
     * Shell metacharacters are backslash-escaped.
     */
    async sendText(serial: string, text: string): Promise<void> {
        const escaped = text.replace(/[ \\&|;<>()$`"']/g, (ch) =>
            ch === ' ' ? '%s' : `\\${ch}`
        );
        await this.exec('-s', serial, 'shell', 'input', 'text', escaped);
    }

    /** Send an Android KeyEvent keycode (e.g. 66 = Enter, 67 = Backspace). */
    async sendKey(serial: string, keycode: number): Promise<void> {
        await this.exec('-s', serial, 'shell', 'input', 'keyevent', String(keycode));
    }

    // ------------------------------------------------------------------ //
    //  Screen
    // ------------------------------------------------------------------ //

    /**
     * Returns the current screen resolution of the device.
     * Parses `adb shell wm size` output ("Physical size: WxH").
     */
    async getScreenSize(serial: string): Promise<{ width: number; height: number }> {
        const output = await this.exec('-s', serial, 'shell', 'wm', 'size');
        const match = output.match(/(\d+)x(\d+)/);
        if (!match) throw new Error(`Could not parse screen size from: ${output}`);
        return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
    }

    async screenshot(serial: string): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            execFile(
                this.adbPath,
                ['-s', serial, 'exec-out', 'screencap', '-p'],
                { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 },
                (err, stdout) => {
                    if (err) { reject(err); return; }
                    const buf = stdout as unknown as Buffer;
                    if (!buf || buf.length === 0) { reject(new Error('Empty screencap output')); return; }
                    resolve(buf);
                }
            );
        });
    }

    async getRotation(serial: string): Promise<number> {
        const out = await this.exec('-s', serial, 'shell', 'settings', 'get', 'system', 'user_rotation');
        return parseInt(out.trim(), 10) || 0;
    }

    async setRotation(serial: string, rotation: number): Promise<void> {
        await this.exec('-s', serial, 'shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
        await this.exec('-s', serial, 'shell', 'settings', 'put', 'system', 'user_rotation', String(rotation));
    }

    async forceStop(serial: string, packageName: string): Promise<void> {
        if (!/^[a-zA-Z][a-zA-Z0-9._]*$/.test(packageName)) {
            throw new Error(`Invalid package name: ${packageName}`);
        }
        await this.exec('-s', serial, 'shell', 'am', 'force-stop', packageName);
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
