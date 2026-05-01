const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");

const { analyzeCode, SUPPORTED_LANGUAGES } = require("../lib/analyzer");
const { createFeedbackStore } = require("./services/feedbackStore");
const { createLlmClient } = require("./services/llmClient");

const analyzeSchema = z.object({
  languageId: z.string(),
  text: z.string().min(1).max(200000),
  diagnostics: z
    .array(
      z.object({
        message: z.string(),
        source: z.string().optional(),
        severity: z.union([z.string(), z.number()]).optional(),
        code: z.union([z.string(), z.number()]).optional(),
        range: z.object({
          start: z.object({
            line: z.number().int().min(0),
            character: z.number().int().min(0)
          }),
          end: z.object({
            line: z.number().int().min(0),
            character: z.number().int().min(0)
          })
        })
      })
    )
    .default([]),
  options: z
    .object({
      enableConsoleLogHints: z.boolean().optional()
    })
    .optional()
});

const feedbackSchema = z.object({
  issueId: z.string().min(1),
  ruleId: z.string().min(1),
  title: z.string().min(1),
  sentiment: z.enum(["helpful", "not_helpful"]),
  createdAt: z.string().optional()
});

function createApp(customOptions = {}) {
  const app = express();
  const feedbackStore =
    customOptions.feedbackStore ||
    createFeedbackStore(path.join(process.cwd(), "data", "feedback.json"));
  const llmClient = customOptions.llmClient || createLlmClient();
  const authToken =
    customOptions.authToken === undefined ? process.env.CODEGUARDIAN_API_TOKEN : customOptions.authToken;
  const allowedOrigins = customOptions.allowedOrigins || process.env.ALLOWED_ORIGINS || "*";

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: allowedOrigins === "*" ? true : allowedOrigins.split(",").map((item) => item.trim())
    })
  );
  app.use(express.json({ limit: "1mb" }));

  if (!customOptions.disableRateLimit) {
    app.use(
      rateLimit({
        windowMs: 60 * 1000,
        max: 60,
        standardHeaders: true,
        legacyHeaders: false
      })
    );
  }

  app.get("/health", async (request, response) => {
    const feedbackSummary = await feedbackStore.getSummary();
    response.json({
      status: "ok",
      supportedLanguages: Array.from(SUPPORTED_LANGUAGES),
      llmEnabled: llmClient.enabled,
      feedbackEntries: feedbackSummary.totalFeedback
    });
  });

  app.use((request, response, next) => {
    if (!authToken) {
      return next();
    }

    const header = request.get("authorization");
    if (header !== `Bearer ${authToken}`) {
      return response.status(401).json({
        error: "Unauthorized"
      });
    }

    return next();
  });

  app.post("/analyze", async (request, response) => {
    const parsed = analyzeSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        error: "Invalid payload",
        details: parsed.error.flatten()
      });
    }

    const feedbackProfile = await feedbackStore.getFeedbackProfile();
    const suggestions = analyzeCode({
      ...parsed.data,
      feedbackProfile
    });
    const enrichedSuggestions = await llmClient.enrichSuggestions({
      text: parsed.data.text,
      languageId: parsed.data.languageId,
      suggestions
    });

    return response.json({
      suggestions: enrichedSuggestions,
      summary: summarizeSuggestions(enrichedSuggestions)
    });
  });

  app.post("/feedback", async (request, response) => {
    const parsed = feedbackSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        error: "Invalid payload",
        details: parsed.error.flatten()
      });
    }

    const saved = await feedbackStore.saveFeedback({
      issueId: parsed.data.issueId,
      ruleId: parsed.data.ruleId,
      title: parsed.data.title,
      sentiment: parsed.data.sentiment === "helpful" ? "helpful" : "notHelpful",
      createdAt: parsed.data.createdAt || new Date().toISOString()
    });

    return response.status(201).json({
      saved
    });
  });

  app.get("/summary", async (request, response) => {
    const summary = await feedbackStore.getSummary();
    response.json(summary);
  });

  return app;
}

function summarizeSuggestions(suggestions) {
  return suggestions.reduce(
    (summary, suggestion) => {
      summary.total += 1;
      summary.byCategory[suggestion.category] = (summary.byCategory[suggestion.category] || 0) + 1;
      summary.bySeverity[suggestion.severity] = (summary.bySeverity[suggestion.severity] || 0) + 1;
      return summary;
    },
    {
      total: 0,
      byCategory: {},
      bySeverity: {}
    }
  );
}

module.exports = {
  createApp
};
