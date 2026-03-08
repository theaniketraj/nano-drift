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
}
