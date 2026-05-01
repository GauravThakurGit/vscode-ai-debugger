const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

const { createApp } = require("../server/app");

function startServer(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`
      });
    });
  });
}

test("analyze endpoint returns suggestions", async () => {
  const feedbackEntries = [];
  const app = createApp({
    disableRateLimit: true,
    authToken: "",
    feedbackStore: {
      async getSummary() {
        return { totalFeedback: 0, rules: {}, recent: [] };
      },
      async getFeedbackProfile() {
        return {};
      },
      async saveFeedback(entry) {
        feedbackEntries.push(entry);
        return entry;
      }
    },
    llmClient: {
      enabled: false,
      async enrichSuggestions({ suggestions }) {
        return suggestions;
      }
    }
  });

  const { server, url } = await startServer(app);

  try {
    const response = await fetch(`${url}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        languageId: "javascript",
        text: "if (a = 10) { console.log('hi'); }"
      })
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(Array.isArray(payload.suggestions));
    assert.ok(payload.suggestions.some((item) => item.ruleId === "assignment-in-conditional"));
    assert.equal(feedbackEntries.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("feedback endpoint accepts validated feedback", async () => {
  const savedEntries = [];
  const app = createApp({
    disableRateLimit: true,
    authToken: "",
    feedbackStore: {
      async getSummary() {
        return { totalFeedback: savedEntries.length, rules: {}, recent: [] };
      },
      async getFeedbackProfile() {
        return {};
      },
      async saveFeedback(entry) {
        savedEntries.push(entry);
        return entry;
      }
    },
    llmClient: {
      enabled: false,
      async enrichSuggestions({ suggestions }) {
        return suggestions;
      }
    }
  });

  const { server, url } = await startServer(app);

  try {
    const response = await fetch(`${url}/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        issueId: "abc123",
        ruleId: "loose-equality",
        title: "Loose equality can hide edge cases",
        sentiment: "helpful"
      })
    });

    assert.equal(response.status, 201);
    assert.equal(savedEntries.length, 1);
    assert.equal(savedEntries[0].ruleId, "loose-equality");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("analyze endpoint can return AI-augmented findings", async () => {
  const app = createApp({
    disableRateLimit: true,
    authToken: "",
    feedbackStore: {
      async getSummary() {
        return { totalFeedback: 0, rules: {}, recent: [] };
      },
      async getFeedbackProfile() {
        return {};
      },
      async saveFeedback(entry) {
        return entry;
      }
    },
    llmClient: {
      enabled: true,
      async enrichSuggestions({ suggestions }) {
        return suggestions.concat([
          {
            id: "ai-issue-1",
            ruleId: "ai-undefined-name",
            title: "Possible undefined name: x",
            explanation: "x is used here but is never defined before use.",
            suggestion: "Declare x before using it or correct the spelling.",
            category: "runtime",
            severity: "error",
            confidence: 0.8,
            source: "AI Debug Engine",
            range: {
              start: { line: 0, character: 6 },
              end: { line: 0, character: 7 }
            },
            fix: null,
            score: 3
          }
        ]);
      }
    }
  });

  const { server, url } = await startServer(app);

  try {
    const response = await fetch(`${url}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        languageId: "python",
        text: "print(x)\n"
      })
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.suggestions.some((item) => item.ruleId === "ai-undefined-name"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
