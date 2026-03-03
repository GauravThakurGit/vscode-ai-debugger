import * as vscode from 'vscode';
import { runRules } from './ruleEngine';

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {

    console.log("CodeGuardian AI Activated");

    diagnosticCollection = vscode.languages.createDiagnosticCollection("codeguardian");
    context.subscriptions.push(diagnosticCollection);

    vscode.workspace.onDidOpenTextDocument(analyze);
    vscode.workspace.onDidChangeTextDocument(event => analyze(event.document));

    if (vscode.window.activeTextEditor) {
        analyze(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            ["javascript", "python"],
            new CodeActionFixer(),
            { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
        )
    );
}

function analyze(document: vscode.TextDocument) {
    if (document.languageId !== "javascript" && document.languageId !== "python") return;
    const diagnostics = runRules(document);
    diagnosticCollection.set(document.uri, diagnostics);
}

class CodeActionFixer implements vscode.CodeActionProvider {

    provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext) {

        const actions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {

            const line = document.lineAt(diagnostic.range.start.line);

            // Add semicolon
            if (diagnostic.code === "addSemicolon") {
                const fix = new vscode.CodeAction("Add semicolon", vscode.CodeActionKind.QuickFix);
                fix.edit = new vscode.WorkspaceEdit();
                fix.edit.insert(document.uri, line.range.end, ";");
                actions.push(fix);
            }

            // Replace var
            if (diagnostic.code === "replaceVar") {
                const fix = new vscode.CodeAction("Replace 'var' with 'let'", vscode.CodeActionKind.QuickFix);
                fix.edit = new vscode.WorkspaceEdit();
                const updated = line.text.replace("var ", "let ");
                fix.edit.replace(document.uri, line.range, updated);
                actions.push(fix);
            }

            // Replace == with ===
            if (diagnostic.code === "replaceEquality") {
                const fix = new vscode.CodeAction("Replace '==' with '==='", vscode.CodeActionKind.QuickFix);
                fix.edit = new vscode.WorkspaceEdit();
                const updated = line.text.replace("==", "===");
                fix.edit.replace(document.uri, line.range, updated);
                actions.push(fix);
            }

            // Remove console.log
            if (diagnostic.code === "removeConsole") {
                const fix = new vscode.CodeAction("Remove console.log statement", vscode.CodeActionKind.QuickFix);
                fix.edit = new vscode.WorkspaceEdit();
                fix.edit.delete(document.uri, line.rangeIncludingLineBreak);
                actions.push(fix);
            }

            // Fix Python print
            if (diagnostic.code === "fixPrint") {
                const fix = new vscode.CodeAction("Convert to Python 3 print()", vscode.CodeActionKind.QuickFix);
                fix.edit = new vscode.WorkspaceEdit();
                const content = line.text.replace("print ", "");
                const updated = `print("${content.replace(/"/g, '')}")`;
                fix.edit.replace(document.uri, line.range, updated);
                actions.push(fix);
            }

            // Fix bare except
            if (diagnostic.code === "fixExcept") {
                const fix = new vscode.CodeAction("Specify exception type", vscode.CodeActionKind.QuickFix);
                fix.edit = new vscode.WorkspaceEdit();
                fix.edit.replace(document.uri, line.range, "except Exception as e:");
                actions.push(fix);
            }
        }

        return actions;
    }
}

export function deactivate() {
    if (diagnosticCollection) {
        diagnosticCollection.dispose();
    }
}