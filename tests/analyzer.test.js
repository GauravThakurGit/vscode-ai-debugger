const test = require("node:test");
const assert = require("node:assert/strict");

const { analyzeCode } = require("../lib/analyzer");

test("detects assignment inside a conditional", () => {
  const suggestions = analyzeCode({
    languageId: "javascript",
    text: "if (a = 10) { console.log('hi'); }"
  });

  const assignmentIssue = suggestions.find((item) => item.ruleId === "assignment-in-conditional");
  assert.ok(assignmentIssue);
  assert.equal(assignmentIssue.fix.text, " === ");
  assert.equal(assignmentIssue.fix.range.start.character, 5);
  assert.equal(assignmentIssue.fix.range.end.character, 8);
});

test("detects loose equality and console log hints", () => {
  const suggestions = analyzeCode({
    languageId: "javascript",
    text: "if (value == '10') { console.log(value); }"
  });

  assert.ok(suggestions.some((item) => item.ruleId === "loose-equality"));
  assert.ok(suggestions.some((item) => item.ruleId === "console-log-leftover"));
});

test("detects risky eval and hardcoded secrets", () => {
  const suggestions = analyzeCode({
    languageId: "javascript",
    text: "const apiKey = 'abcd1234secret'; eval(input);"
  });

  assert.ok(suggestions.some((item) => item.ruleId === "hardcoded-secret"));
  assert.ok(suggestions.some((item) => item.ruleId === "eval-usage"));
});

test("merges native diagnostics into suggestion output", () => {
  const suggestions = analyzeCode({
    languageId: "javascript",
    text: "const value = unknownName;",
    diagnostics: [
      {
        message: "unknownName is not defined.",
        source: "TypeScript",
        severity: 0,
        range: {
          start: { line: 0, character: 14 },
          end: { line: 0, character: 25 }
        }
      }
    ]
  });

  assert.ok(suggestions.some((item) => item.ruleId === "native-diagnostic"));
});

test("ignores CodeGuardian diagnostics when merging editor diagnostics", () => {
  const suggestions = analyzeCode({
    languageId: "javascript",
    text: "if (value == 10) {}",
    diagnostics: [
      {
        message: "Loose equality can hide edge cases: Prefer === for predictable comparisons.",
        source: "CodeGuardian AI",
        severity: 1,
        range: {
          start: { line: 0, character: 4 },
          end: { line: 0, character: 15 }
        }
      }
    ]
  });

  assert.equal(suggestions.filter((item) => item.ruleId === "native-diagnostic").length, 0);
  assert.equal(suggestions.filter((item) => item.ruleId === "loose-equality").length, 1);
});

test("detects Python None comparisons and bare except blocks", () => {
  const suggestions = analyzeCode({
    languageId: "python",
    text: "if value == None:\n    pass\n\ntry:\n    run()\nexcept:\n    pass\n"
  });

  const noneIssue = suggestions.find((item) => item.ruleId === "python-none-comparison");
  assert.ok(noneIssue);
  assert.equal(noneIssue.fix.text, " is None");
  assert.ok(suggestions.some((item) => item.ruleId === "python-bare-except"));
});

test("detects undefined Python names like print(x)", () => {
  const suggestions = analyzeCode({
    languageId: "python",
    text: "print(x)\n"
  });

  const undefinedNameIssue = suggestions.find((item) => item.ruleId === "python-undefined-name");
  assert.ok(undefinedNameIssue);
  assert.equal(undefinedNameIssue.title, "Possible undefined name: x");
  assert.equal(undefinedNameIssue.range.start.line, 0);
});

test("detects Java assignment-in-condition and string equality", () => {
  const suggestions = analyzeCode({
    languageId: "java",
    text: 'if (ready = true) { }\nif (status == "DONE") { }\n'
  });

  const assignmentIssue = suggestions.find((item) => item.ruleId === "java-assignment-in-conditional");
  const stringIssue = suggestions.find((item) => item.ruleId === "java-string-equality");

  assert.ok(assignmentIssue);
  assert.equal(assignmentIssue.fix.text, "==");
  assert.ok(stringIssue);
  assert.equal(stringIssue.fix.text, '"DONE".equals(status)');
});
