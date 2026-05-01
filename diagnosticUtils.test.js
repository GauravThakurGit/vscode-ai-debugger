const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DIAGNOSTIC_SOURCE,
  isCodeGuardianDiagnostic,
  filterExternalDiagnostics,
  buildDiagnosticsHash
} = require("../src/services/diagnosticUtils");

test("identifies CodeGuardian-owned diagnostics", () => {
  assert.equal(isCodeGuardianDiagnostic({ source: DIAGNOSTIC_SOURCE }), true);
  assert.equal(isCodeGuardianDiagnostic({ source: "TypeScript" }), false);
});

test("filters CodeGuardian diagnostics out of editor inputs", () => {
  const diagnostics = [
    { source: DIAGNOSTIC_SOURCE, message: "self", range: { start: {}, end: {} } },
    { source: "TypeScript", message: "external", range: { start: {}, end: {} } }
  ];

  const filtered = filterExternalDiagnostics(diagnostics);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].source, "TypeScript");
});

test("builds stable hashes for the same diagnostic content", () => {
  const diagnostics = [
    {
      message: "value is not defined",
      source: "TypeScript",
      severity: 0,
      code: 2304,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 }
      }
    }
  ];

  assert.equal(buildDiagnosticsHash(diagnostics), buildDiagnosticsHash(diagnostics));
});
