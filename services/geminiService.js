const crypto = require("crypto");
const vscode = require("vscode");

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_SECRET_KEY = "codeguardian.geminiApiKey";

class GeminiService {
  constructor(context, outputChannel) {
    this.context = context;
    this.outputChannel = outputChannel;
    this.cache = new Map();
  }

  isGeminiMode(configuration) {
    return configuration.get("backendMode", "local") === "gemini";
  }

  getModel(configuration) {
    return configuration.get("geminiModel", "gemini-2.5-flash");
  }

  async getApiKey() {
    return this.context.secrets.get(GEMINI_SECRET_KEY);
  }

  buildCacheKey(payload) {
    const hash = crypto.createHash("sha256");
    hash.update(payload.languageId);
    hash.update(JSON.stringify(payload.diagnostics));
    hash.update(payload.text.slice(0, 6000));
    return hash.digest("hex");
  }

  async promptForApiKey({ force = false } = {}) {
    const existingKey = await this.getApiKey();
    if (existingKey && !force) {
      return {
        key: existingKey,
        provided: false,
        cancelled: false
      };
    }

    const input = await vscode.window.showInputBox({
      password: true,
      ignoreFocusOut: true,
      prompt: "Enter your Gemini API key for CodeGuardian AI",
      placeHolder: "AIza...",
      title: "CodeGuardian AI · Gemini API key"
    });

    if (!input || !input.trim()) {
      return {
        key: null,
        provided: false,
        cancelled: true
      };
    }

    const key = input.trim();
    await this.context.secrets.store(GEMINI_SECRET_KEY, key);
    return {
      key,
      provided: true,
      cancelled: false
    };
  }

  async ensureApiKey(configuration, options = {}) {
    const existingKey = await this.getApiKey();
    if (existingKey && !options.forcePrompt) {
      return {
        key: existingKey,
        prompted: false,
        cancelled: false
      };
    }

    if (!options.forcePrompt && options.respectStartupSetting && !configuration.get("promptForGeminiKeyOnStartup", true)) {
      return {
        key: null,
        prompted: false,
        cancelled: false
      };
    }

    const promptResult = await this.promptForApiKey({ force: options.forcePrompt });
    return {
      key: promptResult.key,
      prompted: promptResult.provided,
      cancelled: promptResult.cancelled
    };
  }

  async validateApiKey(configuration, options = {}) {
    const ensureResult = await this.ensureApiKey(configuration, {
      forcePrompt: options.forcePrompt,
      respectStartupSetting: false
    });

    if (!ensureResult.key) {
      const status = buildGeminiStatus(
        "needsKey",
        "Gemini API key required",
        "Add your Gemini API key so CodeGuardian can run AI-powered analysis."
      );
      if (options.showMessages) {
        vscode.window.showWarningMessage(status.detail);
      }
      return status;
    }

    const model = this.getModel(configuration);
    const response = await fetch(`${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}`, {
      method: "GET",
      headers: {
        "x-goog-api-key": ensureResult.key
      }
    });

    if (response.ok) {
      const status = buildGeminiStatus("ready", "Gemini API key active", `Connected to ${model}.`);
      if (options.showMessages) {
        vscode.window.showInformationMessage(status.detail);
      }
      return status;
    }

    const errorPayload = await safeJson(response);
    const status = mapGeminiErrorToStatus(response.status, errorPayload, model);
    if (options.showMessages) {
      vscode.window.showWarningMessage(status.detail);
    }
    return status;
  }

  async analyze(payload, configuration) {
    const cacheKey = this.buildCacheKey(payload);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const ensureResult = await this.ensureApiKey(configuration, {
      forcePrompt: false,
      respectStartupSetting: false
    });

    if (!ensureResult.key) {
      return {
        suggestions: [],
        providerStatus: buildGeminiStatus(
          "needsKey",
          "Gemini API key required",
          "Add your Gemini API key so CodeGuardian can run AI-powered analysis."
        )
      };
    }

    const model = this.getModel(configuration);
    const response = await fetch(`${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": ensureResult.key
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: buildGeminiPrompt(payload)
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1
        }
      })
    });

    if (!response.ok) {
      const errorPayload = await safeJson(response);
      const providerStatus = mapGeminiErrorToStatus(response.status, errorPayload, model);
      this.outputChannel.appendLine(`[CodeGuardian] Gemini analysis failed: ${providerStatus.detail}`);
      return {
        suggestions: [],
        providerStatus
      };
    }

    const responsePayload = await response.json();
    const text = extractGeminiText(responsePayload);
    const parsed = safeJsonText(text);
    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.map((item) => createAiSuggestion(payload.text, item)).filter(Boolean)
      : [];

    const result = {
      suggestions,
      providerStatus: buildGeminiStatus("ready", "Gemini API key active", `Gemini analyzed this file with ${model}.`)
    };

    this.cache.set(cacheKey, result);
    return result;
  }
}

function buildGeminiPrompt(payload) {
  return [
    "You are CodeGuardian AI, a debugging assistant for JavaScript, Python, and Java.",
    "Find real bugs and editor-visible issues such as undefined variables, unresolved names, syntax problems, runtime risks, and broken comparisons.",
    "Do not flag console.log, print, or System.out.println statements as errors unless they are clearly problematic (e.g., logging sensitive data).",
    "Do not flag undefined variables if they are standard library functions or commonly used patterns.",
    "Only report genuine issues that would cause runtime errors or logical bugs.",
    "Return only valid JSON with this shape:",
    '{"suggestions":[{"ruleId":"gemini-rule","title":"...","explanation":"...","suggestion":"...","category":"runtime","severity":"error","matchText":"exact code snippet if possible","line":1}]}',
    "Use severity values error, warning, or info.",
    "Use category values syntax, logical, runtime, performance, or security.",
    "Do not include markdown fences.",
    JSON.stringify({
      languageId: payload.languageId,
      diagnostics: payload.diagnostics,
      code: payload.text.slice(0, 6000)
    })
  ].join("\n");
}

function createAiSuggestion(text, finding) {
  if (!finding || !finding.title || !finding.explanation || !finding.suggestion) {
    return null;
  }

  const range = locateRange(text, finding);
  const severity = normalizeSeverity(finding.severity);
  const category = normalizeCategory(finding.category);
  const ruleId = finding.ruleId || "gemini-finding";

  return {
    id: buildIssueId(ruleId, range),
    ruleId,
    title: finding.title,
    explanation: finding.explanation,
    suggestion: finding.suggestion,
    category,
    severity,
    confidence: 0.76,
    source: "Gemini AI",
    range,
    fix: null,
    score: severity === "error" ? 3 : severity === "warning" ? 2 : 1
  };
}

function locateRange(text, finding) {
  if (typeof finding.matchText === "string" && finding.matchText.trim()) {
    const matchIndex = text.indexOf(finding.matchText);
    if (matchIndex >= 0) {
      return rangeFromOffsets(matchIndex, matchIndex + finding.matchText.length, text);
    }
  }

  if (Number.isInteger(finding.line) && finding.line > 0) {
    const lineIndex = finding.line - 1;
    const lines = text.split(/\r?\n/);
    if (lineIndex >= 0 && lineIndex < lines.length) {
      const lineText = lines[lineIndex];
      let offset = 0;
      for (let index = 0; index < lineIndex; index += 1) {
        offset += lines[index].length + 1;
      }

      return rangeFromOffsets(offset, offset + Math.max(1, lineText.length), text);
    }
  }

  return rangeFromOffsets(0, Math.min(text.length, 1), text);
}

function rangeFromOffsets(startOffset, endOffset, text) {
  const resolver = createPositionResolver(text);
  return {
    start: resolver(startOffset),
    end: resolver(Math.max(startOffset + 1, endOffset))
  };
}

function createPositionResolver(text) {
  const lineOffsets = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      lineOffsets.push(index + 1);
    }
  }

  return (offset) => {
    let low = 0;
    let high = lineOffsets.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (lineOffsets[middle] <= offset) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    const line = Math.max(0, high);
    return {
      line,
      character: Math.max(0, offset - lineOffsets[line])
    };
  };
}

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || "").join("\n").trim();
}

function buildIssueId(ruleId, range) {
  return crypto
    .createHash("sha1")
    .update(`${ruleId}:${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`)
    .digest("hex")
    .slice(0, 12);
}

function normalizeSeverity(value) {
  if (value === "error" || value === "warning" || value === "info") {
    return value;
  }
  return "warning";
}

function normalizeCategory(value) {
  if (["syntax", "logical", "runtime", "performance", "security"].includes(value)) {
    return value;
  }
  return "runtime";
}

function buildGeminiStatus(state, title, detail) {
  return {
    provider: "gemini",
    state,
    title,
    detail
  };
}

function mapGeminiErrorToStatus(statusCode, payload, model) {
  const apiMessage = payload?.error?.message || `Gemini request failed with HTTP ${statusCode}.`;
  const apiStatus = payload?.error?.status || "";

  if (statusCode === 429 || apiStatus === "RESOURCE_EXHAUSTED") {
    return buildGeminiStatus("quota", "Gemini quota reached", apiMessage);
  }

  if (statusCode === 401 || statusCode === 403) {
    return buildGeminiStatus("invalidKey", "Gemini API key rejected", apiMessage);
  }

  if (statusCode === 404) {
    return buildGeminiStatus("modelMissing", "Gemini model unavailable", `${model} is not available: ${apiMessage}`);
  }

  if (statusCode >= 500) {
    return buildGeminiStatus("serviceError", "Gemini service error", apiMessage);
  }

  return buildGeminiStatus("error", "Gemini request failed", apiMessage);
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

function safeJsonText(value) {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(normalized);
  } catch (error) {
    return null;
  }
}

module.exports = {
  GeminiService,
  GEMINI_SECRET_KEY
};
