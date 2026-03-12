import * as vscode from 'vscode';
import * as path from 'path';
import type { BuildError } from './daemon/client';

/**
 * Translates Gradle/Kotlin/Java compiler errors surfaced by the daemon into
 * VS Code diagnostic entries visible in the Problems panel.
 */
export class DiagnosticsManager implements vscode.Disposable {
    private readonly collection: vscode.DiagnosticCollection;

    constructor() {
        this.collection = vscode.languages.createDiagnosticCollection('nano-drift');
    }

    /** Replace all current diagnostics with a fresh set from a build result. */
    update(errors: BuildError[]): void {
        this.collection.clear();

        // Group errors by file URI
        const byFile = new Map<string, vscode.Diagnostic[]>();

        for (const err of errors) {
            const uri = this.resolveUri(err.file);
            const key = uri.toString();
            if (!byFile.has(key)) byFile.set(key, []);

            // VS Code lines are 0-based; Gradle reports 1-based
            const lineNo = Math.max(0, err.line - 1);
            const colNo = Math.max(0, err.column - 1);
            const range = new vscode.Range(lineNo, colNo, lineNo, colNo + 1);

            const severity =
                err.severity === 'error'
                    ? vscode.DiagnosticSeverity.Error
                    : vscode.DiagnosticSeverity.Warning;

            const diag = new vscode.Diagnostic(range, err.message, severity);
            diag.source = 'Nano Drift';

            byFile.get(key)!.push(diag);
        }

        for (const [key, diags] of byFile) {
            this.collection.set(vscode.Uri.parse(key), diags);
        }
    }

    clear(): void {
        this.collection.clear();
    }

    dispose(): void {
        this.collection.dispose();
    }

    // ------------------------------------------------------------------

    /**
     * Turn an absolute file path (possibly with forward slashes) into a
     * `vscode.Uri`.  Falls back to a file URI if the path looks absolute,
     * otherwise tries to resolve it against workspace folders.
     */
    private resolveUri(filePath: string): vscode.Uri {
        // Absolute path check: starts with / or drive letter on Windows
        if (path.isAbsolute(filePath) || /^[A-Za-z]:/.test(filePath)) {
            return vscode.Uri.file(filePath);
        }
        // Relative path — resolve against the first workspace folder
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (ws) {
            return vscode.Uri.file(path.join(ws, filePath));
        }
        return vscode.Uri.file(filePath);
    }
}
