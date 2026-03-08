import * as chokidar from 'chokidar';
import * as path from 'path';

export type ChangeHandler = (filePath: string) => void;

/**
 * Watches Android project source directories for file changes.
 * Debounce / stabilization is handled by chokidar's awaitWriteFinish.
 */
export class FileWatcher {
    private watcher: chokidar.FSWatcher | undefined;

    /**
     * Start watching the Android project at `projectPath`.
     * `onChange` is called with the changed file path.
     */
    watch(projectPath: string, onChange: ChangeHandler): void {
        this.stop();

        const watchPaths = [
            path.join(projectPath, 'app', 'src'),
            path.join(projectPath, 'app', 'build.gradle'),
            path.join(projectPath, 'app', 'build.gradle.kts'),
            path.join(projectPath, 'build.gradle'),
            path.join(projectPath, 'build.gradle.kts'),
            path.join(projectPath, 'settings.gradle'),
            path.join(projectPath, 'settings.gradle.kts'),
        ];

        this.watcher = chokidar.watch(watchPaths, {
            ignoreInitial: true,
            ignored: [
                /(^|[/\\])\../,          // dotfiles / hidden dirs
                /[/\\]build[/\\]/,        // Gradle build outputs
                /[/\\]\.gradle[/\\]/,     // Gradle cache
            ],
            persistent: true,
            awaitWriteFinish: {
                stabilityThreshold: 300,
                pollInterval: 100,
            },
        });

        this.watcher.on('change', onChange);
        this.watcher.on('add', onChange);
    }

    stop(): void {
        void this.watcher?.close();
        this.watcher = undefined;
    }
}
