const path = require("path");

const LANGUAGE_LABELS = {
  javascript: "JavaScript",
  python: "Python",
  java: "Java"
};

function countFixableSuggestions(suggestions) {
  return (suggestions || []).filter((issue) => issue?.fix).length;
}

function buildSidebarMessage(fileName, suggestions) {
  if (!fileName) {
    return "Open a JavaScript, Python, or Java file to view live suggestions.";
  }

  const issueCount = (suggestions || []).length;
  const fixableCount = countFixableSuggestions(suggestions);
  if (issueCount === 0) {
    return `${path.basename(fileName)} is clean right now.`;
  }

  const issueLabel = `${issueCount} issue${issueCount === 1 ? "" : "s"}`;
  const quickFixLabel =
    fixableCount === 0
      ? "No quick fixes are available yet."
      : `${fixableCount} quick fix${fixableCount === 1 ? "" : "es"} ready to apply.`;

  return `${issueLabel} in ${path.basename(fileName)}. ${quickFixLabel}`;
}

function buildSummaryLabel(fileName, suggestions) {
  const issueCount = (suggestions || []).length;
  const fixableCount = countFixableSuggestions(suggestions);
  const safeFileName = fileName ? path.basename(fileName) : "Active file";

  if (issueCount === 0) {
    return {
      label: `${safeFileName} is clean`,
      description: "No issues found"
    };
  }

  return {
    label: `${issueCount} issue${issueCount === 1 ? "" : "s"} in ${safeFileName}`,
    description:
      fixableCount > 0
        ? `${fixableCount} quick fix${fixableCount === 1 ? "" : "es"} available`
        : "Review suggestions"
  };
}

function buildIssueDescription(issue) {
  const lineNumber = (issue?.range?.start?.line ?? 0) + 1;
  const severity = capitalize(issue?.severity || "warning");
  const tail = issue?.fix ? "Quick fix ready" : capitalize(issue?.category || "review");
  return `Line ${lineNumber} | ${severity} | ${tail}`;
}

function buildFixPreview(text, issue) {
  if (!text || !issue?.fix || issue.fix.type !== "replace") {
    return null;
  }

  const lines = text.split(/\r?\n/);
  const lineIndex = issue.fix.range?.start?.line;
  const endLineIndex = issue.fix.range?.end?.line;
  if (lineIndex === undefined || lineIndex < 0 || lineIndex >= lines.length || lineIndex !== endLineIndex) {
    return null;
  }

  const originalLine = lines[lineIndex];
  const startCharacter = issue.fix.range.start.character;
  const endCharacter = issue.fix.range.end.character;
  const updatedLine =
    originalLine.slice(0, startCharacter) + issue.fix.text + originalLine.slice(endCharacter);

  return {
    before: truncateLine(originalLine),
    after: truncateLine(updatedLine)
  };
}

function sortFixableIssuesForApplication(issues) {
  return [...(issues || [])]
    .filter((issue) => issue?.fix?.type === "replace")
    .sort((left, right) => {
      if (right.fix.range.start.line !== left.fix.range.start.line) {
        return right.fix.range.start.line - left.fix.range.start.line;
      }
      return right.fix.range.start.character - left.fix.range.start.character;
    });
}

function getLanguageLabel(languageId) {
  return LANGUAGE_LABELS[languageId] || capitalize(languageId || "Code");
}

function buildSeverityStats(suggestions) {
  const counts = {
    error: 0,
    warning: 0,
    info: 0
  };

  for (const issue of suggestions || []) {
    if (counts[issue.severity] !== undefined) {
      counts[issue.severity] += 1;
    }
  }

  return [
    { key: "error", label: "Errors", count: counts.error, tone: "error" },
    { key: "warning", label: "Warnings", count: counts.warning, tone: "warning" },
    { key: "info", label: "Hints", count: counts.info, tone: "info" }
  ];
}

function capitalize(value) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function truncateLine(value, maxLength = 90) {
  if (value.length <= maxLength) {
    return value.trim();
  }

  return `${value.slice(0, maxLength - 3).trim()}...`;
}

module.exports = {
  countFixableSuggestions,
  buildSidebarMessage,
  buildSummaryLabel,
  buildIssueDescription,
  buildFixPreview,
  sortFixableIssuesForApplication,
  getLanguageLabel,
  buildSeverityStats
};
