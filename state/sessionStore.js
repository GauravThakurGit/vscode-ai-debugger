class SessionStore {
  constructor(context) {
    this.context = context;
    this.suggestionsByDocument = new Map();
    this.documentSnapshotsByUri = new Map();
    this.sessionEvents = [];
    this.feedbackProfileKey = "codeguardian.feedbackProfile";
    this.analysisProviderStatus = {
      provider: "local",
      state: "idle",
      title: "Local analysis ready",
      detail: "CodeGuardian is using local heuristics until you choose another provider."
    };
  }

  recordAnalysis(document, suggestions) {
    const uri = document.uri.toString();
    const issuesWithDocumentMetadata = suggestions.map((issue) => ({
      ...issue,
      documentUri: uri,
      fileName: document.fileName
    }));

    this.suggestionsByDocument.set(uri, issuesWithDocumentMetadata);
    this.documentSnapshotsByUri.set(uri, {
      fileName: document.fileName,
      languageId: document.languageId,
      text: document.getText()
    });
    this.sessionEvents.push({
      type: "analysis",
      uri,
      languageId: document.languageId,
      fileName: document.fileName,
      suggestionCount: issuesWithDocumentMetadata.length,
      createdAt: new Date().toISOString()
    });
  }

  getSuggestions(uri) {
    return this.suggestionsByDocument.get(uri.toString()) || [];
  }

  getIssue(uri, issueId) {
    return this.getSuggestions(uri).find((item) => item.id === issueId) || null;
  }

  getDocumentSnapshot(uri) {
    return this.documentSnapshotsByUri.get(uri.toString()) || null;
  }

  getFeedbackProfile() {
    return this.context.globalState.get(this.feedbackProfileKey, {});
  }

  setAnalysisProviderStatus(status) {
    this.analysisProviderStatus = {
      ...this.analysisProviderStatus,
      ...status
    };
  }

  getAnalysisProviderStatus() {
    return this.analysisProviderStatus;
  }

  async recordFeedback(issue, sentiment) {
    const profile = this.getFeedbackProfile();
    const current = profile[issue.ruleId] || { helpful: 0, notHelpful: 0 };

    if (sentiment === "helpful") {
      current.helpful += 1;
    } else {
      current.notHelpful += 1;
    }

    profile[issue.ruleId] = current;
    await this.context.globalState.update(this.feedbackProfileKey, profile);

    this.sessionEvents.push({
      type: "feedback",
      issueId: issue.id,
      ruleId: issue.ruleId,
      sentiment,
      title: issue.title,
      createdAt: new Date().toISOString()
    });
  }

  recordAppliedFix(issue) {
    this.sessionEvents.push({
      type: "fix-applied",
      issueId: issue.id,
      ruleId: issue.ruleId,
      title: issue.title,
      createdAt: new Date().toISOString()
    });
  }

  buildSummary() {
    const categoryCounts = {};
    const severityCounts = {};
    const ruleCounts = {};
    let totalSuggestions = 0;

    for (const suggestions of this.suggestionsByDocument.values()) {
      totalSuggestions += suggestions.length;
      for (const suggestion of suggestions) {
        categoryCounts[suggestion.category] = (categoryCounts[suggestion.category] || 0) + 1;
        severityCounts[suggestion.severity] = (severityCounts[suggestion.severity] || 0) + 1;
        ruleCounts[suggestion.ruleId] = (ruleCounts[suggestion.ruleId] || 0) + 1;
      }
    }

    const feedbackProfile = this.getFeedbackProfile();
    const topRules = Object.entries(ruleCounts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5);

    const recentEvents = this.sessionEvents.slice(-10).reverse();
    const lines = [
      "# CodeGuardian AI Session Summary",
      "",
      `Generated at: ${new Date().toLocaleString()}`,
      "",
      `Total tracked suggestions: ${totalSuggestions}`,
      "",
      "## Suggestions by category",
      ...formatMetricList(categoryCounts),
      "",
      "## Suggestions by severity",
      ...formatMetricList(severityCounts),
      "",
      "## Most common rules",
      ...(topRules.length > 0
        ? topRules.map(([ruleId, count]) => `- ${ruleId}: ${count}`)
        : ["- No recurring rules yet"]),
      "",
      "## Learned feedback profile",
      ...formatFeedbackProfile(feedbackProfile),
      "",
      "## Recent session events",
      ...(recentEvents.length > 0
        ? recentEvents.map((event) => `- ${event.createdAt}: ${describeEvent(event)}`)
        : ["- No events recorded yet"])
    ];

    return lines.join("\n");
  }
}

function formatMetricList(metrics) {
  const entries = Object.entries(metrics);
  if (entries.length === 0) {
    return ["- No data yet"];
  }

  return entries
    .sort((left, right) => right[1] - left[1])
    .map(([key, value]) => `- ${key}: ${value}`);
}

function formatFeedbackProfile(profile) {
  const entries = Object.entries(profile);
  if (entries.length === 0) {
    return ["- No feedback captured yet"];
  }

  return entries.map(
    ([ruleId, value]) => `- ${ruleId}: helpful ${value.helpful || 0}, not helpful ${value.notHelpful || 0}`
  );
}

function describeEvent(event) {
  if (event.type === "analysis") {
    return `Analyzed ${event.fileName} and found ${event.suggestionCount} suggestions`;
  }
  if (event.type === "fix-applied") {
    return `Applied fix for ${event.ruleId}`;
  }
  return `Recorded ${event.sentiment} feedback for ${event.ruleId}`;
}

module.exports = {
  SessionStore
};
