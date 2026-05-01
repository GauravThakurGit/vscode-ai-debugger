const vscode = require("vscode");
const { sortFixableIssuesForApplication } = require("../services/suggestionUtils");

class CodeGuardianCodeActionProvider {
  constructor(sessionStore) {
    this.sessionStore = sessionStore;
  }

  provideCodeActions(document, range) {
    const issues = this.sessionStore
      .getSuggestions(document.uri)
      .filter((issue) => issue.fix && intersects(issue.range, range));

    return issues.map((issue) => createFixAction(document, issue));
  }
}

function createFixAction(document, issue) {
  const action = new vscode.CodeAction(issue.fix.label, vscode.CodeActionKind.QuickFix);
  action.edit = buildWorkspaceEdit(document, issue);
  action.command = {
    command: "codeguardian.recordAppliedFix",
    title: "Record applied fix",
    arguments: [issue]
  };
  action.diagnostics = [];
  return action;
}

function buildWorkspaceEdit(document, issue) {
  const edit = new vscode.WorkspaceEdit();
  applyReplaceFixes(edit, document, [issue]);
  return edit;
}

function buildWorkspaceEditForIssues(document, issues) {
  const edit = new vscode.WorkspaceEdit();
  applyReplaceFixes(edit, document, issues);
  return edit;
}

function applyReplaceFixes(edit, document, issues) {
  for (const issue of sortFixableIssuesForApplication(issues)) {
    edit.replace(document.uri, toRange(issue.fix.range), issue.fix.text);
  }
}

function intersects(issueRange, selectionRange) {
  return toRange(issueRange).intersection(selectionRange) !== undefined;
}

function toRange(range) {
  return new vscode.Range(
    new vscode.Position(range.start.line, range.start.character),
    new vscode.Position(range.end.line, range.end.character)
  );
}

module.exports = {
  CodeGuardianCodeActionProvider,
  buildWorkspaceEdit,
  buildWorkspaceEditForIssues
};
