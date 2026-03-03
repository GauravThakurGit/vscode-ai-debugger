import * as vscode from 'vscode';
import { javascriptRules } from './rules/javascriptRules';
import { pythonRules } from './rules/pythonRules';

export interface BugRule {
    check(document: vscode.TextDocument, line: string, lineNumber: number): vscode.Diagnostic | null;
}

export function runRules(document: vscode.TextDocument): vscode.Diagnostic[] {

    const diagnostics: vscode.Diagnostic[] = [];
    const lines = document.getText().split("\n");

    let rules: BugRule[] = [];

    if (document.languageId === "javascript") {
        rules = javascriptRules;
    }

    if (document.languageId === "python") {
        rules = pythonRules;
    }

    lines.forEach((line, index) => {
        for (const rule of rules) {
            const result = rule.check(document, line, index);
            if (result) {
                diagnostics.push(result);
            }
        }
    });

    return diagnostics;
}