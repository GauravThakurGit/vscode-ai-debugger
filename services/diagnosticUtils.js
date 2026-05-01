const DIAGNOSTIC_SOURCE = "CodeGuardian AI";

function isCodeGuardianDiagnostic(diagnostic) {
  return diagnostic?.source === DIAGNOSTIC_SOURCE;
}

function filterExternalDiagnostics(diagnostics) {
  return (diagnostics || []).filter((diagnostic) => !isCodeGuardianDiagnostic(diagnostic));
}

function buildDiagnosticsHash(diagnostics) {
  return JSON.stringify(
    (diagnostics || []).map((diagnostic) => ({
      message: diagnostic.message,
      source: diagnostic.source || "",
      severity: diagnostic.severity,
      code:
        typeof diagnostic.code === "string" || typeof diagnostic.code === "number"
          ? diagnostic.code
          : diagnostic.code?.value || "",
      startLine: diagnostic.range?.start?.line ?? -1,
      startCharacter: diagnostic.range?.start?.character ?? -1,
      endLine: diagnostic.range?.end?.line ?? -1,
      endCharacter: diagnostic.range?.end?.character ?? -1
    }))
  );
}

module.exports = {
  DIAGNOSTIC_SOURCE,
  isCodeGuardianDiagnostic,
  filterExternalDiagnostics,
  buildDiagnosticsHash
};
