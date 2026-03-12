import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface BuildError {
    file: string;
    line: number;
    column: number;
    severity: 'error' | 'warning';
    message: string;
}

export type LineCallback = (line: string) => void;

export class GradleRunner {
    /**
     * Run an incremental Gradle build in `projectPath`.
     * @param projectPath  Absolute path to the Android project root (contains gradlew).
     * @param args         Gradle tasks + flags, e.g. ['installDebug', '--parallel'].
     * @param onLine       Optional callback invoked for each output line streamed.
     */
    build(
        projectPath: string,
        args: string[] = ['installDebug', '--parallel'],
        onLine?: LineCallback
    ): Promise<BuildError[]> {
        const gradlew = this.resolveGradlew(projectPath);
        const errors: BuildError[] = [];

        return new Promise<BuildError[]>((resolve, reject) => {
            const child = spawn(gradlew, args, {
                cwd: projectPath,
                stdio: 'pipe',
                shell: process.platform === 'win32',
            });

            const processLine = (line: string) => {
                onLine?.(line);
                const parsed = parseGradleLine(line);
                if (parsed) errors.push(parsed);
            };

            let stdoutBuf = '';
            let stderrBuf = '';
            let allOutput = '';

            child.stdout?.on('data', (d: Buffer) => {
                stdoutBuf += d.toString();
                const lines = stdoutBuf.split('\n');
                stdoutBuf = lines.pop() ?? '';
                lines.forEach(processLine);
                allOutput += d.toString();
            });

            child.stderr?.on('data', (d: Buffer) => {
                stderrBuf += d.toString();
                const lines = stderrBuf.split('\n');
                stderrBuf = lines.pop() ?? '';
                lines.forEach(processLine);
                allOutput += d.toString();
            });

            child.on('close', (code) => {
                // flush remaining partial lines
                if (stdoutBuf) processLine(stdoutBuf);
                if (stderrBuf) processLine(stderrBuf);

                if (code === 0) {
                    resolve(errors);
                } else {
                    const tail = allOutput.slice(-3000);
                    reject(
                        Object.assign(
                            new Error(`Gradle exited with code ${code}.\n${tail}`),
                            { buildErrors: errors }
                        )
                    );
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

// ---------------------------------------------------------------------------
//  Gradle / Kotlin / Java error-line parser
// ---------------------------------------------------------------------------

/**
 * Kotlin compiler: `e: /path:10:5: error message`
 * Kotlin compiler: `w: /path:10:5: warning message`
 * Also handles URI form: `e: file:///path:10:5: message`
 * Java compiler:   `/path/File.java:10: error: message`
 */
export function parseGradleLine(line: string): BuildError | undefined {
    const trimmed = line.trim();

    // Kotlin format (new): "e: file:///abs/path.kt:10:5: message"
    // Kotlin format (old): "e: /abs/path.kt: (10, 5): message"
    const kotlinNew = trimmed.match(
        /^([ew]):\s+(?:file:\/\/)?(.+?):(\d+):(\d+):\s+(.+)$/
    );
    if (kotlinNew) {
        const [, level, file, lineStr, colStr, msg] = kotlinNew;
        return {
            file: normalizePath(file),
            line: parseInt(lineStr, 10),
            column: parseInt(colStr, 10),
            severity: level === 'e' ? 'error' : 'warning',
            message: msg.trim(),
        };
    }

    const kotlinOld = trimmed.match(
        /^([ew]):\s+(.+?):\s+\((\d+),\s*(\d+)\):\s+(.+)$/
    );
    if (kotlinOld) {
        const [, level, file, lineStr, colStr, msg] = kotlinOld;
        return {
            file: normalizePath(file),
            line: parseInt(lineStr, 10),
            column: parseInt(colStr, 10),
            severity: level === 'e' ? 'error' : 'warning',
            message: msg.trim(),
        };
    }

    // Java format: "/abs/path/File.java:10: error: message"
    const java = trimmed.match(/^(.+\.java):(\d+):\s+(error|warning):\s+(.+)$/);
    if (java) {
        const [, file, lineStr, severity, msg] = java;
        return {
            file: normalizePath(file),
            line: parseInt(lineStr, 10),
            column: 0,
            severity: severity as 'error' | 'warning',
            message: msg.trim(),
        };
    }

    return undefined;
}

function normalizePath(p: string): string {
    return p.replace(/\\/g, '/');
}
