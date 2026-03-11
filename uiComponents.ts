import * as vscode from 'vscode';

export class UIComponents {
	private statusBarItem: vscode.StatusBarItem;
	private outputChannel: vscode.OutputChannel;

	constructor() {
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.outputChannel = vscode.window.createOutputChannel('CodeGuardian AI');
	}

	showErrorAnalysis(analysis: any): void {
		const message = `${analysis.originalError.category}: ${analysis.originalError.message}`;
		vscode.window.showInformationMessage(message, 'View Details').then(action => {
			if (action === 'View Details') {
				this.showDetailPanel(analysis);
			}
		});
	}

	private showDetailPanel(analysis: any): void {
		this.outputChannel.clear();
		this.outputChannel.appendLine('=== CodeGuardian AI - Error Analysis ===\n');
		this.outputChannel.appendLine(`Category: ${analysis.originalError.category}`);
		this.outputChannel.appendLine(`Severity: ${analysis.originalError.severity}`);
		this.outputChannel.appendLine(`Message: ${analysis.originalError.message}`);
		this.outputChannel.appendLine(`Location: Line ${analysis.originalError.line + 1}`);
		this.outputChannel.appendLine('\n=== Explanation ===\n');
		this.outputChannel.appendLine(analysis.explanation);
		this.outputChannel.appendLine('\n=== Suggested Fixes ===\n');
		analysis.fixSuggestions.forEach((suggestion: string, index: number) => {
			this.outputChannel.appendLine(`${index + 1}. ${suggestion}`);
		});
		this.outputChannel.show();
	}

	updateStatusBar(totalErrors: number, criticalErrors: number): void {
		if (totalErrors > 0) {
			this.statusBarItem.text = `🛡️ CodeGuardian: ${totalErrors} issues (${criticalErrors} critical)`;
			this.statusBarItem.command = 'codeguardian.showDebugPanel';
			this.statusBarItem.show();
		} else {
			this.statusBarItem.text = '🛡️ CodeGuardian: No issues detected';
			this.statusBarItem.show();
		}
	}

	showMessage(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
		if (type === 'error') {
			vscode.window.showErrorMessage(message);
		} else if (type === 'warning') {
			vscode.window.showWarningMessage(message);
		} else {
			vscode.window.showInformationMessage(message);
		}
	}

	showOutput(): void {
		this.outputChannel.show();
	}

	dispose(): void {
		this.statusBarItem.dispose();
		this.outputChannel.dispose();
	}
}
