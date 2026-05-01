const vscode = require("vscode");

const { AnalysisService } = require("./services/analysisService");
const { GeminiService } = require("./services/geminiService");
const {
  DIAGNOSTIC_SOURCE,
  filterExternalDiagnostics,
  buildDiagnosticsHash
} = require("./services/diagnosticUtils");
const { SuggestionViewProvider } = require("./providers/suggestionViewProvider");
const { CodeGuardianHoverProvider } = require("./providers/hoverProvider");
const {
  CodeGuardianCodeActionProvider,
  buildWorkspaceEdit,
  buildWorkspaceEditForIssues
} = require("./providers/codeActionProvider");
const { SessionStore } = require("./state/sessionStore");
const { sortFixableIssuesForApplication } = require("./services/suggestionUtils");

async function activate(context) {
  const outputChannel = vscode.window.createOutputChannel("CodeGuardian AI");
  const diagnosticCollection = vscode.languages.createDiagnosticCollection("codeguardian");
  const sessionStore = new SessionStore(context);
  const geminiService = new GeminiService(context, outputChannel);
  const analysisService = new AnalysisService(sessionStore, outputChannel, geminiService);
  const suggestionViewProvider = new SuggestionViewProvider(context.extensionUri, sessionStore);
  const codeActionProvider = new CodeGuardianCodeActionProvider(sessionStore);
  const configuration = () => vscode.workspace.getConfiguration("codeguardian");
  const debounceTimers = new Map();
  const externalDiagnosticHashes = new Map();
  let providerStatus = null;
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  const supportedLanguages = analysisService.getSupportedLanguageIds();
  const documentSelector = supportedLanguages.map((language) => ({ language }));

  statusBarItem.text = "$(shield) CodeGuardian ready";
  statusBarItem.command = "codeguardian.openSessionSummary";
  statusBarItem.show();

  function updateStatusBar() {
    if (providerStatus && providerStatus.state !== "ready") {
      statusBarItem.text = `$(shield) ${providerStatus.title}`;
    } else {
      const activeDocument = vscode.window.activeTextEditor?.document;
      if (activeDocument && analysisService.isSupportedDocument(activeDocument)) {
        const suggestions = sessionStore.getSuggestions(activeDocument.uri);
        statusBarItem.text = `$(shield) CodeGuardian: ${suggestions.length} issue${suggestions.length === 1 ? "" : "s"}`;
      } else {
        statusBarItem.text = "$(shield) CodeGuardian ready";
      }
    }
  }

  suggestionViewProvider.registerHandlers({
    analyzeActiveFile: () => vscode.commands.executeCommand("codeguardian.analyzeActiveFile"),
    applyAllSuggestions: (payload) => vscode.commands.executeCommand("codeguardian.applyAllSuggestions", payload),
    openSessionSummary: () => vscode.commands.executeCommand("codeguardian.openSessionSummary"),
    revealSuggestion: (payload) => vscode.commands.executeCommand("codeguardian.revealSuggestion", payload),
    applySuggestedFix: (payload) => vscode.commands.executeCommand("codeguardian.applySuggestedFix", payload),
    markSuggestionHelpful: (payload) => vscode.commands.executeCommand("codeguardian.markSuggestionHelpful", payload),
    markSuggestionNotHelpful: (payload) =>
      vscode.commands.executeCommand("codeguardian.markSuggestionNotHelpful", payload),
    setGeminiApiKey: () => vscode.commands.executeCommand("codeguardian.setGeminiApiKey"),
    validateGeminiApiKey: () => vscode.commands.executeCommand("codeguardian.validateGeminiApiKey"),
    clearGeminiApiKey: () => vscode.commands.executeCommand("codeguardian.clearGeminiApiKey")
  });

  context.subscriptions.push(
    outputChannel,
    diagnosticCollection,
    statusBarItem,
    vscode.window.registerWebviewViewProvider("codeGuardianView", suggestionViewProvider, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    }),
    vscode.languages.registerHoverProvider(documentSelector, new CodeGuardianHoverProvider(sessionStore)),
    vscode.languages.registerCodeActionsProvider(documentSelector, codeActionProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codeguardian.analyzeActiveFile", async () => {
      const document = vscode.window.activeTextEditor?.document;
      if (!document) {
        vscode.window.showInformationMessage("Open a JavaScript, Python, or Java file to run CodeGuardian.");
        return;
      }

      if (!analysisService.isSupportedDocument(document)) {
        vscode.window.showInformationMessage("CodeGuardian currently supports JavaScript, Python, and Java.");
        return;
      }

      await analyzeAndPublish(document);
    }),
    vscode.commands.registerCommand("codeguardian.setGeminiApiKey", async () => {
      const promptResult = await geminiService.promptForApiKey({ force: true });
      if (promptResult.cancelled || !promptResult.key) {
        vscode.window.showWarningMessage("Gemini API key was not saved.");
        return;
      }

      const status = await analysisService.ensureGeminiReady(configuration(), { showMessages: true });
      sessionStore.setAnalysisProviderStatus(status);
      suggestionViewProvider.refresh();
      const activeDocument = vscode.window.activeTextEditor?.document;
      if (activeDocument && analysisService.isSupportedDocument(activeDocument)) {
        scheduleAnalysis(activeDocument);
      }
    }),
    vscode.commands.registerCommand("codeguardian.validateGeminiApiKey", async () => {
      const status = await analysisService.ensureGeminiReady(configuration(), {
        forcePrompt: false,
        showMessages: true
      });
      sessionStore.setAnalysisProviderStatus(status);
      suggestionViewProvider.refresh();
    }),
    vscode.commands.registerCommand("codeguardian.clearGeminiApiKey", async () => {
      await geminiService.clearApiKey();
      const status = {
        provider: "gemini",
        state: "needsKey",
        title: "Gemini API key removed",
        detail: "Add a Gemini API key to enable AI-powered analysis again."
      };
      sessionStore.setAnalysisProviderStatus(status);
      suggestionViewProvider.refresh();
      vscode.window.showInformationMessage(status.detail);
    }),
    vscode.commands.registerCommand("codeguardian.applyAllSuggestions", async (target) => {
      const editor = await openEditorForTarget(target);
      if (!editor || !analysisService.isSupportedDocument(editor.document)) {
        vscode.window.showInformationMessage("Open a supported file with CodeGuardian suggestions first.");
        return;
      }

      const fixableIssues = sortFixableIssuesForApplication(sessionStore.getSuggestions(editor.document.uri));
      if (fixableIssues.length === 0) {
        vscode.window.showInformationMessage("No CodeGuardian quick fixes are available for this file yet.");
        return;
      }

      const edit = buildWorkspaceEditForIssues(editor.document, fixableIssues);
      await vscode.workspace.applyEdit(edit);
      for (const issue of fixableIssues) {
        sessionStore.recordAppliedFix(issue);
      }

      vscode.window.showInformationMessage(
        `Applied ${fixableIssues.length} CodeGuardian quick fix${fixableIssues.length === 1 ? "" : "es"}.`
      );
      scheduleAnalysis(editor.document);
    }),
    vscode.commands.registerCommand("codeguardian.openSessionSummary", async () => {
      const document = await vscode.workspace.openTextDocument({
        content: sessionStore.buildSummary(),
        language: "markdown"
      });
      await vscode.window.showTextDocument(document, { preview: false });
    }),
    vscode.commands.registerCommand("codeguardian.revealSuggestion", async (target) => {
      const issue = resolveIssueReference(target);
      const editor = await openEditorForTarget(target, issue);
      if (!editor || !issue) {
        return;
      }

      const range = toRange(issue.range);
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }),
    vscode.commands.registerCommand("codeguardian.markSuggestionHelpful", async (target) => {
      await handleFeedback(target, "helpful");
    }),
    vscode.commands.registerCommand("codeguardian.markSuggestionNotHelpful", async (target) => {
      await handleFeedback(target, "notHelpful");
    }),
    vscode.commands.registerCommand("codeguardian.applySuggestedFix", async (target) => {
      const issue = resolveIssueReference(target);
      const editor = await openEditorForTarget(target, issue);
      if (!editor || !issue || !issue.fix) {
        return;
      }

      const edit = buildWorkspaceEdit(editor.document, issue);
      await vscode.workspace.applyEdit(edit);
      sessionStore.recordAppliedFix(issue);
      vscode.window.showInformationMessage(`Applied CodeGuardian fix: ${issue.fix.label}`);
      scheduleAnalysis(editor.document);
    }),
    vscode.commands.registerCommand("codeguardian.recordAppliedFix", async (target) => {
      const issue = resolveIssueReference(target);
      if (issue) {
        sessionStore.recordAppliedFix(issue);
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      updateSidebarContext(editor?.document || null);
      if (editor?.document && analysisService.isSupportedDocument(editor.document)) {
        scheduleAnalysis(editor.document);
      }
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (analysisService.isSupportedDocument(document)) {
        scheduleAnalysis(document);
      }
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (analysisService.isSupportedDocument(document)) {
        scheduleAnalysis(document);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (analysisService.isSupportedDocument(event.document)) {
        scheduleAnalysis(event.document);
      }
    }),
    vscode.languages.onDidChangeDiagnostics((event) => {
      const activeDocument = vscode.window.activeTextEditor?.document;
      if (!activeDocument) {
        return;
      }

      const documentKey = activeDocument.uri.toString();
      const changed = event.uris.some((uri) => uri.toString() === documentKey);
      if (!changed || !analysisService.isSupportedDocument(activeDocument)) {
        return;
      }

      const externalDiagnostics = getExternalDiagnostics(activeDocument.uri);
      const nextHash = buildDiagnosticsHash(externalDiagnostics);
      const previousHash = externalDiagnosticHashes.get(documentKey);

      if (nextHash !== previousHash) {
        scheduleAnalysis(activeDocument);
      }
    })
  );

  updateSidebarContext(vscode.window.activeTextEditor?.document || null);
  await initializeProviderStatus();
  if (vscode.window.activeTextEditor?.document && analysisService.isSupportedDocument(vscode.window.activeTextEditor.document)) {
    scheduleAnalysis(vscode.window.activeTextEditor.document);
  }

  function updateSidebarContext(document) {
    suggestionViewProvider.setActiveDocument(document, Boolean(document && analysisService.isSupportedDocument(document)));
  }

  function scheduleAnalysis(document) {
    const externalDiagnostics = getExternalDiagnostics(document.uri);
    if (externalDiagnostics.length === 0) {
      // Only analyze if there are errors to check
      return;
    }
    const key = document.uri.toString();
    const delay = configuration().get("analysisDebounceMs", 2000);
    clearTimeout(debounceTimers.get(key));
    const timer = setTimeout(() => {
      analyzeAndPublish(document).catch((error) => {
        outputChannel.appendLine(`[CodeGuardian] Analysis failed: ${error.message}`);
      });
    }, delay);
    debounceTimers.set(key, timer);
  }

  async function analyzeAndPublish(document) {
    if (!analysisService.isSupportedDocument(document)) {
      diagnosticCollection.delete(document.uri);
      return;
    }

    const externalDiagnostics = getExternalDiagnostics(document.uri);
    const result = await analysisService.analyzeDocument(document, externalDiagnostics, configuration());
    const diagnostics = result.suggestions.map(toDiagnostic);
    const documentKey = document.uri.toString();

    diagnosticCollection.set(document.uri, diagnostics);
    externalDiagnosticHashes.set(documentKey, buildDiagnosticsHash(externalDiagnostics));
    sessionStore.recordAnalysis(document, result.suggestions);
    if (result.providerStatus) {
      providerStatus = result.providerStatus;
      sessionStore.setAnalysisProviderStatus(result.providerStatus);
    }
    updateSidebarContext(document);
    updateStatusBar();
    if (result.suggestions.length > 0 || result.mode !== "local") {
      outputChannel.appendLine(
        `[CodeGuardian] ${result.mode} analysis for ${document.fileName}: ${result.suggestions.length} suggestion(s)`
      );
    }
  }

  async function handleFeedback(target, sentiment) {
    const issue = resolveIssueReference(target);
    if (!issue) {
      return;
    }

    await sessionStore.recordFeedback(issue, sentiment);
    await analysisService.recordFeedback(issue, sentiment, configuration());
    suggestionViewProvider.refresh();
    vscode.window.showInformationMessage(
      sentiment === "helpful"
        ? "CodeGuardian learned that this suggestion was helpful."
        : "CodeGuardian learned that this suggestion needs improvement."
    );
  }

  function resolveIssueReference(target) {
    if (!target) {
      return null;
    }

    if (target.id && target.ruleId) {
      return target;
    }

    if (target.documentUri && target.issueId) {
      return sessionStore.getIssue({ toString: () => target.documentUri }, target.issueId);
    }

    return null;
  }

  async function openEditorForTarget(target, resolvedIssue) {
    const issue = resolvedIssue || resolveIssueReference(target);
    const documentUri = target?.documentUri || issue?.documentUri;
    if (!documentUri) {
      return vscode.window.activeTextEditor;
    }

    const targetUri = vscode.Uri.parse(documentUri);
    const openEditor = vscode.window.visibleTextEditors.find(
      (editor) => editor.document.uri.toString() === targetUri.toString()
    );
    if (openEditor) {
      await vscode.window.showTextDocument(openEditor.document, openEditor.viewColumn, false);
      return openEditor;
    }

    const document = await vscode.workspace.openTextDocument(targetUri);
    return vscode.window.showTextDocument(document, { preview: false });
  }

  async function initializeProviderStatus() {
    const backendMode = configuration().get("backendMode", "local");
    if (backendMode === "gemini") {
      const status = await analysisService.ensureGeminiReady(configuration(), {
        forcePrompt: false,
        respectStartupSetting: true,
        showMessages: true
      });
      providerStatus = status;
      sessionStore.setAnalysisProviderStatus(status);
      suggestionViewProvider.refresh();
      updateStatusBar();
      return;
    }

    if (backendMode === "server") {
      providerStatus = {
        provider: "server",
        state: "ready",
        title: "Server analysis selected",
        detail: `CodeGuardian will use ${configuration().get("serverUrl", "http://127.0.0.1:4000")} when available.`
      };
      sessionStore.setAnalysisProviderStatus(providerStatus);
      suggestionViewProvider.refresh();
      updateStatusBar();
      return;
    }

    providerStatus = {
      provider: "local",
      state: "ready",
      title: "Local analysis active",
      detail: "CodeGuardian is using built-in local heuristics."
    };
    sessionStore.setAnalysisProviderStatus(providerStatus);
    suggestionViewProvider.refresh();
    updateStatusBar();
  }
}

function deactivate() {}

function toDiagnostic(issue) {
  const range = toRange(issue.range);
  const severity = mapSeverity(issue.severity);
  const diagnostic = new vscode.Diagnostic(range, `${issue.title}: ${issue.suggestion}`, severity);
  diagnostic.source = DIAGNOSTIC_SOURCE;
  diagnostic.code = issue.ruleId;
  return diagnostic;
}

function getExternalDiagnostics(uri) {
  return filterExternalDiagnostics(vscode.languages.getDiagnostics(uri));
}

function mapSeverity(severity) {
  if (severity === "error") {
    return vscode.DiagnosticSeverity.Error;
  }
  if (severity === "info") {
    return vscode.DiagnosticSeverity.Information;
  }
  return vscode.DiagnosticSeverity.Warning;
}

function toRange(range) {
  return new vscode.Range(
    new vscode.Position(range.start.line, range.start.character),
    new vscode.Position(range.end.line, range.end.character)
  );
}

module.exports = {
  activate,
  deactivate
};
