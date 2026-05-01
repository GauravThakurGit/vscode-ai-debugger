const { analyzeCode, SUPPORTED_LANGUAGES } = require("../../lib/analyzer");

class AnalysisService {
  constructor(sessionStore, outputChannel, geminiService) {
    this.sessionStore = sessionStore;
    this.outputChannel = outputChannel;
    this.geminiService = geminiService;
  }

  isSupportedDocument(document) {
    return document && SUPPORTED_LANGUAGES.has(document.languageId);
  }

  getSupportedLanguageIds() {
    return Array.from(SUPPORTED_LANGUAGES);
  }

  async analyzeDocument(document, nativeDiagnostics, configuration) {
    const request = {
      languageId: document.languageId,
      text: document.getText(),
      diagnostics: nativeDiagnostics.map(mapDiagnostic),
      options: {
        enableConsoleLogHints: configuration.get("enableConsoleLogHints", true)
      }
    };

    const localSuggestions = analyzeCode({
      ...request,
      feedbackProfile: this.sessionStore.getFeedbackProfile()
    });

    const backendMode = configuration.get("backendMode", "local");
    if (backendMode === "gemini") {
      const geminiResult = await this.analyzeViaGemini(request, configuration);
      return {
        mode: "gemini",
        suggestions: mergeSuggestions(localSuggestions, geminiResult.suggestions),
        providerStatus: geminiResult.providerStatus
      };
    }

    if (backendMode === "server") {
      try {
        const serverResult = await this.analyzeViaServer(request, configuration);
        return {
          mode: "server",
          suggestions: serverResult.suggestions,
          providerStatus: {
            provider: "server",
            state: "ready",
            title: "Server analysis active",
            detail: `Connected to ${configuration.get("serverUrl", "http://127.0.0.1:4000")}.`
          }
        };
      } catch (error) {
        this.outputChannel.appendLine(
          `[CodeGuardian] Backend unavailable, falling back to local analysis: ${error.message}`
        );
        return {
          mode: "local",
          suggestions: localSuggestions,
          providerStatus: {
            provider: "server",
            state: "offline",
            title: "Server unavailable",
            detail: `Fell back to local analysis because the backend returned: ${error.message}`
          }
        };
      }
    }

    return {
      mode: "local",
      suggestions: localSuggestions,
      providerStatus: {
        provider: "local",
        state: "ready",
        title: "Local analysis active",
        detail: "CodeGuardian is using built-in local heuristics."
      }
    };
  }

  async ensureGeminiReady(configuration, options = {}) {
    if (!this.geminiService || configuration.get("backendMode", "local") !== "gemini") {
      return {
        provider: configuration.get("backendMode", "local"),
        state: "ready",
        title: "Ready",
        detail: ""
      };
    }

    return this.geminiService.validateApiKey(configuration, options);
  }

  async analyzeViaServer(payload, configuration) {
    const serverUrl = configuration.get("serverUrl", "http://127.0.0.1:4000").replace(/\/$/, "");
    const token = configuration.get("serverToken", "");
    const response = await fetch(`${serverUrl}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    return {
      mode: "server",
      suggestions: Array.isArray(result.suggestions) ? result.suggestions : []
    };
  }

  async analyzeViaGemini(payload, configuration) {
    if (!this.geminiService) {
      return {
        suggestions: [],
        providerStatus: {
          provider: "gemini",
          state: "error",
          title: "Gemini unavailable",
          detail: "Gemini service was not initialized in the extension."
        }
      };
    }

    return this.geminiService.analyze(payload, configuration);
  }

  async recordFeedback(issue, sentiment, configuration) {
    if (configuration.get("backendMode", "local") !== "server") {
      return;
    }

    const serverUrl = configuration.get("serverUrl", "http://127.0.0.1:4000").replace(/\/$/, "");
    const token = configuration.get("serverToken", "");
    const payload = {
      issueId: issue.id,
      ruleId: issue.ruleId,
      title: issue.title,
      sentiment: sentiment === "helpful" ? "helpful" : "not_helpful"
    };

    try {
      await fetch(`${serverUrl}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      this.outputChannel.appendLine(`[CodeGuardian] Failed to sync feedback: ${error.message}`);
    }
  }
}

function mergeSuggestions(primarySuggestions, secondarySuggestions) {
  const merged = [...(primarySuggestions || [])];
  for (const suggestion of secondarySuggestions || []) {
    const exists = merged.some((existing) => {
      return (
        existing.ruleId === suggestion.ruleId &&
        existing.range.start.line === suggestion.range.start.line &&
        existing.range.start.character === suggestion.range.start.character
      );
    });

    if (!exists) {
      merged.push(suggestion);
    }
  }

  return merged.sort((left, right) => {
    if ((right.score || 0) !== (left.score || 0)) {
      return (right.score || 0) - (left.score || 0);
    }
    if (left.range.start.line !== right.range.start.line) {
      return left.range.start.line - right.range.start.line;
    }
    return left.range.start.character - right.range.start.character;
  });
}

function mapDiagnostic(diagnostic) {
  return {
    message: diagnostic.message,
    source: diagnostic.source || "VS Code",
    severity: diagnostic.severity,
    code:
      typeof diagnostic.code === "string" || typeof diagnostic.code === "number"
        ? diagnostic.code
        : diagnostic.code?.value,
    range: {
      start: {
        line: diagnostic.range.start.line,
        character: diagnostic.range.start.character
      },
      end: {
        line: diagnostic.range.end.line,
        character: diagnostic.range.end.character
      }
    }
  };
}

module.exports = {
  AnalysisService
};
