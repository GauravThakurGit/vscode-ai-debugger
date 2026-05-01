const crypto = require("crypto");

const SEVERITY_SCORE = {
  error: 3,
  warning: 2,
  info: 1
};

function createLlmClient() {
  const apiUrl = process.env.LLM_API_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || "generic-debug-model";

  return {
    enabled: Boolean(apiUrl && apiKey),
    async enrichSuggestions({ text, languageId, suggestions }) {
      if (!apiUrl || !apiKey) {
        return suggestions;
      }

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content: [
                  "You are a debugging assistant for JavaScript, Python, and Java.",
                  "Return compact JSON with this shape:",
                  '{"overrides":[{"id":"existing-id","explanation":"...","suggestion":"..."}],"findings":[{"ruleId":"ai-rule","title":"...","explanation":"...","suggestion":"...","category":"runtime","severity":"error","matchText":"exact code snippet if possible","line":1}]}',
                  "Use overrides only for existing suggestions.",
                  "Use findings only for high-confidence additional issues not already listed.",
                  "Keep explanations concise and actionable."
                ].join(" ")
              },
              {
                role: "user",
                content: JSON.stringify({
                  languageId,
                  codePreview: text.slice(0, 5000),
                  existingSuggestions: suggestions.map((item) => ({
                    id: item.id,
                    ruleId: item.ruleId,
                    title: item.title,
                    explanation: item.explanation,
                    suggestion: item.suggestion,
                    category: item.category,
                    severity: item.severity
                  }))
                })
              }
            ],
            response_format: {
              type: "json_object"
            }
          })
        });

        if (!response.ok) {
          return suggestions;
        }

        const payload = await response.json();
        const content =
          payload.output_text ||
          payload.choices?.[0]?.message?.content ||
          payload.choices?.[0]?.text ||
          "";

        const parsed = normalizeParsedPayload(typeof content === "string" ? safeJsonParse(content) : content);
        return mergeSuggestions(text, suggestions, parsed);
      } catch (error) {
        return suggestions;
      }
    }
  };
}

function normalizeParsedPayload(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return {
      overrides: [],
      findings: []
    };
  }

  const overrides = Array.isArray(parsed.overrides) ? parsed.overrides : [];
  const findings = Array.isArray(parsed.findings)
    ? parsed.findings
    : Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((item) => !item.id)
      : [];

  return {
    overrides:
      overrides.length > 0
        ? overrides
        : Array.isArray(parsed.suggestions)
          ? parsed.suggestions.filter((item) => item.id)
          : [],
    findings
  };
}

function mergeSuggestions(text, suggestions, parsed) {
  const updatedSuggestions = suggestions.map((item) => {
    const override = parsed.overrides.find((candidate) => candidate.id === item.id);
    if (!override) {
      return item;
    }

    return {
      ...item,
      explanation: override.explanation || item.explanation,
      suggestion: override.suggestion || item.suggestion
    };
  });

  const newFindings = parsed.findings
    .map((finding) => createAiSuggestion(text, finding))
    .filter(Boolean)
    .filter((candidate) => {
      return !updatedSuggestions.some((existing) => {
        return (
          existing.ruleId === candidate.ruleId &&
          existing.range.start.line === candidate.range.start.line &&
          existing.range.start.character === candidate.range.start.character
        );
      });
    });

  return updatedSuggestions.concat(newFindings);
}

function createAiSuggestion(text, finding) {
  if (!finding || !finding.title || !finding.explanation || !finding.suggestion) {
    return null;
  }

  const severity = normalizeSeverity(finding.severity);
  const category = normalizeCategory(finding.category);
  const range = locateRange(text, finding);
  const ruleId = finding.ruleId || "ai-additional-finding";

  return {
    id: buildIssueId(ruleId, range),
    ruleId,
    title: finding.title,
    explanation: finding.explanation,
    suggestion: finding.suggestion,
    category,
    severity,
    confidence: 0.74,
    source: "AI Debug Engine",
    range,
    fix: null,
    score: SEVERITY_SCORE[severity]
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
    const lineOffsets = buildLineOffsets(text);
    if (lineIndex >= 0 && lineIndex < lineOffsets.length) {
      const startOffset = lineOffsets[lineIndex];
      const endOffset =
        lineIndex + 1 < lineOffsets.length ? lineOffsets[lineIndex + 1] - 1 : Math.max(startOffset + 1, text.length);
      return rangeFromOffsets(startOffset, endOffset, text);
    }
  }

  return rangeFromOffsets(0, Math.min(1, text.length), text);
}

function buildLineOffsets(text) {
  const offsets = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function rangeFromOffsets(startIndex, endIndex, text) {
  const resolver = createPositionResolver(text);
  return {
    start: resolver(startIndex),
    end: resolver(Math.max(startIndex + 1, endIndex))
  };
}

function createPositionResolver(text) {
  const lineOffsets = buildLineOffsets(text);

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

function buildIssueId(ruleId, range) {
  return crypto
    .createHash("sha1")
    .update(`${ruleId}:${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`)
    .digest("hex")
    .slice(0, 12);
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

module.exports = {
  createLlmClient
};
