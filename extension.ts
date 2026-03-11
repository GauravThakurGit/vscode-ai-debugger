import * as vscode from 'vscode';
import { ErrorListener } from './errorListener';
import { ErrorCategorizer } from './errorCategorization';
import { AIDebugEngine } from './aiDebugEngine';
import { UIComponents } from './uiComponents';

let errorListener: ErrorListener;
let errorCategorizer: ErrorCategorizer;
let aiDebugEngine: AIDebugEngine;
let uiComponents: UIComponents;
let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
	console.log('CodeGuardian AI activated');

	diagnosticCollection = vscode.languages.createDiagnosticCollection('codeguardian');
	errorListener = new ErrorListener(diagnosticCollection);
	errorCategorizer = new ErrorCategorizer();

	const config = vscode.workspace.getConfiguration('codeguardian');
	const apiKey = config.get<string>('apiKey') || '';
	aiDebugEngine = new AIDebugEngine(apiKey);

	uiComponents = new UIComponents();

	const enableRealTime = config.get<boolean>('enableRealTimeAnalysis', true);
	if (enableRealTime) {
		errorListener.initialize();
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('codeguardian.analyzeCode', analyzeCode),
		vscode.commands.registerCommand('codeguardian.showDebugPanel', () => uiComponents.showOutput()),
		vscode.languages.onDidChangeDiagnostics(handleDiagnosticsChange),
		vscode.workspace.onDidChangeConfiguration(handleConfigChange),
		diagnosticCollection,
		{
			dispose: () => {
				errorListener.dispose();
				uiComponents.dispose();
			}
		}
	);

	uiComponents.showMessage('CodeGuardian AI ready', 'info');
}

async function analyzeCode(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		uiComponents.showMessage('No active editor', 'warning');
		return;
	}

	const document = editor.document;
	const diagnostics = diagnosticCollection.get(document.uri) || [];

	let totalErrors = 0;
	let criticalErrors = 0;

	for (const diagnostic of diagnostics) {
		const line = document.lineAt(diagnostic.range.start.line);
		const context = getCodeContext(document, diagnostic.range.start.line);

		const categorizedError = errorCategorizer.categorizeError(
			diagnostic.message,
			line.text,
			diagnostic.range.start.line,
			diagnostic.range.start.character
		);

		const analysis = await aiDebugEngine.analyzeError(categorizedError, context);
		uiComponents.showErrorAnalysis(analysis);

		totalErrors++;
		if (categorizedError.severity === 'critical') {
			criticalErrors++;
		}
	}

	uiComponents.updateStatusBar(totalErrors, criticalErrors);

	if (totalErrors === 0) {
		uiComponents.showMessage('No issues detected', 'info');
	}
}

function getCodeContext(document: vscode.TextDocument, lineNumber: number): string {
	const start = Math.max(0, lineNumber - 3);
	const end = Math.min(document.lineCount - 1, lineNumber + 3);
	let context = '';
	for (let i = start; i <= end; i++) {
		context += document.lineAt(i).text + '\n';
	}
	return context;
}

function handleDiagnosticsChange(event: vscode.DiagnosticsChangeEvent): void {
	for (const uri of event.uris) {
		const editor = vscode.window.visibleTextEditors.find(e => e.document.uri === uri);
		if (editor) {
			const diagnostics = diagnosticCollection.get(uri) || [];
			const criticalCount = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
			uiComponents.updateStatusBar(diagnostics.length, criticalCount);
		}
	}
}

function handleConfigChange(event: vscode.ConfigurationChangeEvent): void {
	if (event.affectsConfiguration('codeguardian')) {
		const config = vscode.workspace.getConfiguration('codeguardian');
		const newApiKey = config.get<string>('apiKey') || '';
		aiDebugEngine = new AIDebugEngine(newApiKey);
	}
}

export function deactivate() {
	console.log('CodeGuardian AI deactivated');
}
