import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class GradleRunner {
    /**
     * Run an incremental Gradle build in `projectPath`.
     * @param projectPath  Absolute path to the Android project root (contains gradlew).
     * @param args         Gradle tasks + flags, e.g. ['installDebug', '--parallel'].
     */
    build(projectPath: string, args: string[] = ['installDebug', '--parallel']): Promise<void> {
        const gradlew = this.resolveGradlew(projectPath);

        return new Promise<void>((resolve, reject) => {
            const child = spawn(gradlew, args, {
                cwd: projectPath,
                stdio: 'pipe',
                // On Windows, .bat files must run through the shell
                shell: process.platform === 'win32',
            });

            let stderr = '';
            child.stdout?.on('data', (d: Buffer) => process.stdout.write(d));
            child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    // Keep only the last 3000 chars so the error message stays readable
                    reject(new Error(`Gradle exited with code ${code}.\n${stderr.slice(-3000)}`));
                }
            });

            child.on('error', (err) => reject(new Error(`Failed to run Gradle: ${err.message}`)));
        });
    }

    private resolveGradlew(projectPath: string): string {
        const isWindows = process.platform === 'win32';
        const wrapper = path.join(projectPath, isWindows ? 'gradlew.bat' : 'gradlew');

        if (!fs.existsSync(wrapper)) {
            throw new Error(
                `Gradle wrapper not found at "${wrapper}". ` +
                'Make sure you opened an Android project root.'
            );
        }

        return wrapper;
    }
}
