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
exports.javascriptRules = void 0;
const vscode = __importStar(require("vscode"));
exports.javascriptRules = [
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
                const diagnostic = new vscode.Diagnostic(range, "Statement may be missing a semicolon.", vscode.DiagnosticSeverity.Warning);
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
                const diagnostic = new vscode.Diagnostic(range, "Use 'let' instead of 'var' for block scoping.", vscode.DiagnosticSeverity.Warning);
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
                const diagnostic = new vscode.Diagnostic(range, "Use strict equality (===) instead of ==.", vscode.DiagnosticSeverity.Warning);
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
                const diagnostic = new vscode.Diagnostic(range, "Remove console.log before production deployment.", vscode.DiagnosticSeverity.Information);
                diagnostic.code = "removeConsole";
                return diagnostic;
            }
            return null;
        }
    }
];
//# sourceMappingURL=javascriptRules.js.map