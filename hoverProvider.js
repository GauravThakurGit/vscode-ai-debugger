const vscode = require("vscode");

class CodeGuardianHoverProvider {
  constructor(sessionStore) {
    this.sessionStore = sessionStore;
  }

  provideHover(document, position) {
    const issue = this.sessionStore
      .getSuggestions(document.uri)
      .find((candidate) => containsPosition(candidate.range, position));

    if (!issue) {
      return null;
    }

    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.appendMarkdown(`**${issue.title}**\n\n`);
    markdown.appendMarkdown(`${issue.explanation}\n\n`);
    markdown.appendMarkdown(`Suggested fix: ${issue.suggestion}\n\n`);
    markdown.appendMarkdown(`Category: \`${issue.category}\`  Severity: \`${issue.severity}\``);
    if (issue.fix) {
      markdown.appendMarkdown("\n\nUse **Quick Fix** to apply the recommended change.");
    }

    return new vscode.Hover(markdown, toRange(issue.range));
  }
}

function containsPosition(range, position) {
  const issueRange = toRange(range);
  return issueRange.contains(position);
}

function toRange(range) {
  return new vscode.Range(
    new vscode.Position(range.start.line, range.start.character),
    new vscode.Position(range.end.line, range.end.character)
  );
}

module.exports = {
  CodeGuardianHoverProvider
};
