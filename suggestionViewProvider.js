const path = require("path");
const vscode = require("vscode");
const {
  countFixableSuggestions,
  buildFixPreview,
  buildSidebarMessage,
  buildSeverityStats,
  getLanguageLabel
} = require("../services/suggestionUtils");

class SuggestionViewProvider {
  constructor(extensionUri, sessionStore) {
    this.extensionUri = extensionUri;
    this.sessionStore = sessionStore;
    this.view = null;
    this.handlers = {};
    this.activeDocument = null;
  }

  registerHandlers(handlers) {
    this.handlers = handlers;
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")]
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    if (typeof webviewView.onDidDispose === "function") {
      webviewView.onDidDispose(() => {
        this.view = null;
      });
    }
    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(message);
    });
    this.render();
  }

  setActiveDocument(document, isSupported) {
    if (!document) {
      this.activeDocument = null;
    } else {
      this.activeDocument = {
        uri: document.uri.toString(),
        fileName: document.fileName,
        languageId: document.languageId,
        isSupported
      };
    }

    this.render();
  }

  refresh() {
    this.render();
  }

  async handleMessage(message) {
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === "analyze-now") {
      return this.handlers.analyzeActiveFile?.();
    }
    if (message.type === "ready") {
      this.render();
      return;
    }
    if (message.type === "apply-all") {
      return this.handlers.applyAllSuggestions?.({ documentUri: message.documentUri });
    }
    if (message.type === "open-summary") {
      return this.handlers.openSessionSummary?.();
    }
    if (message.type === "reveal") {
      return this.handlers.revealSuggestion?.({
        documentUri: message.documentUri,
        issueId: message.issueId
      });
    }
    if (message.type === "apply-fix") {
      return this.handlers.applySuggestedFix?.({
        documentUri: message.documentUri,
        issueId: message.issueId
      });
    }
    if (message.type === "feedback") {
      const command = message.sentiment === "helpful" ? "markSuggestionHelpful" : "markSuggestionNotHelpful";
      return this.handlers[command]?.({
        documentUri: message.documentUri,
        issueId: message.issueId
      });
    }
  }

  render() {
    if (!this.view) {
      return;
    }

    const state = this.buildState();
    this.view.description = state.viewDescription || "";
    this.view.webview.postMessage({
      type: "state",
      payload: state
    });
  }

  buildState() {
    const providerStatus = this.sessionStore.getAnalysisProviderStatus();

    if (!this.activeDocument) {
      return {
        mode: "empty",
        title: "CodeGuardian AI",
        subtitle: "Open a JavaScript, Python, or Java file to start live debugging.",
        supportedLanguages: ["JavaScript", "Python", "Java"],
        viewDescription: "Idle",
        providerStatus
      };
    }

    if (!this.activeDocument.isSupported) {
      return {
        mode: "unsupported",
        title: path.basename(this.activeDocument.fileName),
        subtitle: `${getLanguageLabel(this.activeDocument.languageId)} is not supported yet in this panel.`,
        supportedLanguages: ["JavaScript", "Python", "Java"],
        viewDescription: "Unsupported",
        providerStatus
      };
    }

    const snapshot = this.sessionStore.getDocumentSnapshot({ toString: () => this.activeDocument.uri });
    const suggestions = this.sessionStore.getSuggestions({ toString: () => this.activeDocument.uri });
    const issueCount = suggestions.length;
    const fixableCount = countFixableSuggestions(suggestions);
    const severityStats = buildSeverityStats(suggestions);
    const fileName = snapshot?.fileName || this.activeDocument.fileName;

    return {
      mode: issueCount === 0 ? "clean" : "ready",
      title: path.basename(fileName),
      subtitle: buildSidebarMessage(fileName, suggestions),
      languageLabel: getLanguageLabel(this.activeDocument.languageId),
      documentUri: this.activeDocument.uri,
      issueCount,
      fixableCount,
      severityStats,
      canApplyAll: fixableCount > 0,
      viewDescription: issueCount === 0 ? "Clean" : `${issueCount} issue${issueCount === 1 ? "" : "s"}`,
      providerStatus,
      suggestions: suggestions.map((issue) => {
        const preview = buildFixPreview(snapshot?.text || "", issue);
        return {
          issueId: issue.id,
          documentUri: issue.documentUri || this.activeDocument.uri,
          title: issue.title,
          explanation: issue.explanation,
          suggestion: issue.suggestion,
          line: (issue.range?.start?.line ?? 0) + 1,
          severity: issue.severity,
          category: issue.category,
          source: issue.source || "CodeGuardian",
          fixLabel: issue.fix?.label || null,
          canApplyFix: Boolean(issue.fix),
          beforeLine: preview?.before || null,
          afterLine: preview?.after || null,
          learningNote: issue.learningNote || null
        };
      })
    };
  }

  getHtml(webview) {
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "sidebar.css"));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "sidebar.js"));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${stylesUri}" />
    <title>CodeGuardian AI</title>
  </head>
  <body>
    <div id="app" class="app-shell"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

function getNonce() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let index = 0; index < 32; index += 1) {
    value += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return value;
}

module.exports = {
  SuggestionViewProvider
};
