"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRules = runRules;
const javascriptRules_1 = require("./rules/javascriptRules");
const pythonRules_1 = require("./rules/pythonRules");
function runRules(document) {
    const diagnostics = [];
    const lines = document.getText().split("\n");
    let rules = [];
    if (document.languageId === "javascript") {
        rules = javascriptRules_1.javascriptRules;
    }
    if (document.languageId === "python") {
        rules = pythonRules_1.pythonRules;
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
//# sourceMappingURL=ruleEngine.js.map