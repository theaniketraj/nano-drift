import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Resolves the Android SDK root from settings or environment variables.
 * Returns undefined if the SDK cannot be found.
 */
export async function detectAndroidSdk(): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('nanoDrift');
    const configPath = config.get<string>('androidHome');
    if (configPath && fs.existsSync(configPath)) {
        return configPath;
    }

    const envPath = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'];
    if (envPath && fs.existsSync(envPath)) {
        return envPath;
    }

    return undefined;
}

export function resolveAdb(sdkPath: string): string {
    return path.join(
        sdkPath,
        'platform-tools',
        process.platform === 'win32' ? 'adb.exe' : 'adb'
    );
}

export function resolveEmulator(sdkPath: string): string {
    return path.join(
        sdkPath,
        'emulator',
        process.platform === 'win32' ? 'emulator.exe' : 'emulator'
    );
}
