import * as vscode from 'vscode';
import { BugRule } from '../ruleEngine';

export const pythonRules: BugRule[] = [

    // Old print syntax
    {
        check(document, line, lineNumber) {
            if (line.trim().startsWith("print ") && !line.includes("(")) {
                const range = new vscode.Range(lineNumber, 0, lineNumber, line.length);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    "Python 3 requires parentheses in print().",
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.code = "fixPrint";
                return diagnostic;
            }
            return null;
        }
    },

    // Bare except
    {
        check(document, line, lineNumber) {
            if (line.trim() === "except:") {
                const range = new vscode.Range(lineNumber, 0, lineNumber, line.length);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    "Specify exception type instead of bare except.",
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.code = "fixExcept";
                return diagnostic;
            }
            return null;
        }
    }

];