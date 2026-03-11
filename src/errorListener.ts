import * as vscode from 'vscode';

export class ErrorListener {
	private diagnosticCollection: vscode.DiagnosticCollection;
	private disposables: vscode.Disposable[] = [];

	constructor(diagnosticCollection: vscode.DiagnosticCollection) {
		this.diagnosticCollection = diagnosticCollection;
	}

	initialize(): void {
		this.disposables.push(
			vscode.workspace.onDidOpenTextDocument((doc) => this.analyze(doc)),
			vscode.workspace.onDidChangeTextDocument((event) => this.analyze(event.document)),
			vscode.workspace.onDidSaveTextDocument((doc) => this.analyze(doc))
		);

		vscode.workspace.textDocuments.forEach(doc => this.analyze(doc));
	}

	private analyze(document: vscode.TextDocument): void {
		if (this.isExcludedFile(document)) return;

		const diagnostics: vscode.Diagnostic[] = [];
		const lines = document.getText().split('\n');

		lines.forEach((line, i) => {
			if (line.trim().length === 0) return;
			this.detectErrors(line, i, diagnostics);
		});

		this.diagnosticCollection.set(document.uri, diagnostics);
	}

	private detectErrors(line: string, lineIndex: number, diagnostics: vscode.Diagnostic[]): void {
		const trimmed = line.trim();
		
		if (trimmed.startsWith('//') || trimmed.startsWith('/*')) return;

		if (trimmed.length > 0 && !trimmed.endsWith(';') && !trimmed.endsWith('{') && !trimmed.endsWith('}') && !trimmed.endsWith(',')) {
			const range = new vscode.Range(lineIndex, line.length - 1, lineIndex, line.length);
			const diag = new vscode.Diagnostic(range, 'Missing semicolon', vscode.DiagnosticSeverity.Warning);
			diag.source = 'CodeGuardian';
			diagnostics.push(diag);
		}
	}

	private isExcludedFile(document: vscode.TextDocument): boolean {
		return ['plaintext', 'markdown'].includes(document.languageId);
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}
