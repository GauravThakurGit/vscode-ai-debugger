import * as vscode from 'vscode';
import { BugRule } from '../ruleEngine';

export const javascriptRules: BugRule[] = [

    // Missing semicolon
    {
        check(document, line, lineNumber) {
            if (line.trim() && !line.trim().endsWith(";") &&
                !line.trim().endsWith("{") &&
                !line.trim().endsWith("}") &&
                !line.includes("if") &&
                !line.includes("for") &&
                !line.includes("while")) {

                const range = new vscode.Range(lineNumber, 0, lineNumber, line.length);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    "Statement may be missing a semicolon.",
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.code = "addSemicolon";
                return diagnostic;
            }
            return null;
        }
    },

    // Replace var with let
    {
        check(document, line, lineNumber) {
            if (line.trim().startsWith("var ")) {
                const range = new vscode.Range(lineNumber, 0, lineNumber, line.length);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    "Use 'let' instead of 'var' for block scoping.",
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.code = "replaceVar";
                return diagnostic;
            }
            return null;
        }
    },

    // Replace == with ===
    {
        check(document, line, lineNumber) {
            if (line.includes("==") && !line.includes("===")) {
                const range = new vscode.Range(lineNumber, 0, lineNumber, line.length);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    "Use strict equality (===) instead of ==.",
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.code = "replaceEquality";
                return diagnostic;
            }
            return null;
        }
    },

    // console.log removal suggestion
    {
        check(document, line, lineNumber) {
            if (line.includes("console.log")) {
                const range = new vscode.Range(lineNumber, 0, lineNumber, line.length);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    "Remove console.log before production deployment.",
                    vscode.DiagnosticSeverity.Information
                );
                diagnostic.code = "removeConsole";
                return diagnostic;
            }
            return null;
        }
    }

];