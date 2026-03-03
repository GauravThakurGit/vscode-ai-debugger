"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ruleEngine_1 = require("./ruleEngine");
let diagnosticCollection;
function activate(context) {
    console.log("CodeGuardian AI Activated");
    diagnosticCollection = vscode.languages.createDiagnosticCollection("codeguardian");
    context.subscriptions.push(diagnosticCollection);
    vscode.workspace.onDidOpenTextDocument(analyze);
    vscode.workspace.onDidChangeTextDocument(event => analyze(event.document));
    if (vscode.window.activeTextEditor) {
        analyze(vscode.window.activeTextEditor.document);
    }
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider(["javascript", "python"], new CodeActionFixer(), { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }));
}
function analyze(document) {
    if (document.languageId !== "javascript" && document.languageId !== "python")
        return;
    const diagnostics = (0, ruleEngine_1.runRules)(document);
    diagnosticCollection.set(document.uri, diagnostics);
}
class CodeActionFixer {
    provideCodeActions(document, range, context) {
        const actions = [];
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
function deactivate() {
    if (diagnosticCollection) {
        diagnosticCollection.dispose();
    }
}
//# sourceMappingURL=extension.js.map