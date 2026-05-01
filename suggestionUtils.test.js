const test = require("node:test");
const assert = require("node:assert/strict");

const {
  countFixableSuggestions,
  buildSidebarMessage,
  buildSummaryLabel,
  buildIssueDescription,
  buildFixPreview,
  sortFixableIssuesForApplication,
  getLanguageLabel,
  buildSeverityStats
} = require("../src/services/suggestionUtils");

test("counts fixable suggestions", () => {
  const issues = [{ fix: { type: "replace" } }, { fix: null }, {}];
  assert.equal(countFixableSuggestions(issues), 1);
});

test("builds helpful sidebar summary messaging", () => {
  const message = buildSidebarMessage("C:\\demo\\cleanTest.js", [{ fix: { type: "replace" } }]);
  assert.equal(message, "1 issue in cleanTest.js. 1 quick fix ready to apply.");
});

test("builds summary labels for clean files", () => {
  const summary = buildSummaryLabel("C:\\demo\\cleanTest.js", []);
  assert.equal(summary.label, "cleanTest.js is clean");
  assert.equal(summary.description, "No issues found");
});

test("describes issue location and quick-fix status", () => {
  const description = buildIssueDescription({
    severity: "warning",
    category: "logical",
    fix: { type: "replace" },
    range: {
      start: { line: 2 }
    }
  });

  assert.equal(description, "Line 3 | Warning | Quick fix ready");
});

test("builds before and after line previews for replace fixes", () => {
  const preview = buildFixPreview("if (x = 10) {\n}", {
    fix: {
      type: "replace",
      text: " === ",
      range: {
        start: { line: 0, character: 5 },
        end: { line: 0, character: 8 }
      }
    }
  });

  assert.deepEqual(preview, {
    before: "if (x = 10) {",
    after: "if (x === 10) {"
  });
});

test("sorts fixable issues from bottom to top for safe application", () => {
  const sorted = sortFixableIssuesForApplication([
    { fix: { type: "replace", range: { start: { line: 0, character: 1 } } } },
    { fix: { type: "replace", range: { start: { line: 3, character: 5 } } } },
    { fix: { type: "replace", range: { start: { line: 3, character: 2 } } } }
  ]);

  assert.deepEqual(
    sorted.map((issue) => `${issue.fix.range.start.line}:${issue.fix.range.start.character}`),
    ["3:5", "3:2", "0:1"]
  );
});

test("maps language ids to polished labels", () => {
  assert.equal(getLanguageLabel("javascript"), "JavaScript");
  assert.equal(getLanguageLabel("python"), "Python");
  assert.equal(getLanguageLabel("java"), "Java");
});

test("builds severity stats in a stable order", () => {
  const stats = buildSeverityStats([
    { severity: "warning" },
    { severity: "error" },
    { severity: "warning" }
  ]);

  assert.deepEqual(stats.map((item) => item.count), [1, 2, 0]);
});
