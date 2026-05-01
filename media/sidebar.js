(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById("app");

  vscode.postMessage({ type: "ready" });

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message?.type === "state") {
      render(message.payload);
    }
  });

  document.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    const action = actionTarget.getAttribute("data-action");
    const documentUri = actionTarget.getAttribute("data-document-uri");
    const issueId = actionTarget.getAttribute("data-issue-id");
    const sentiment = actionTarget.getAttribute("data-sentiment");

    if (action === "analyze-now") {
      vscode.postMessage({ type: "analyze-now" });
      return;
    }

    if (action === "apply-all") {
      vscode.postMessage({ type: "apply-all", documentUri });
      return;
    }

    if (action === "open-summary") {
      vscode.postMessage({ type: "open-summary" });
      return;
    }

    if (action === "reveal") {
      vscode.postMessage({ type: "reveal", documentUri, issueId });
      return;
    }

    if (action === "apply-fix") {
      vscode.postMessage({ type: "apply-fix", documentUri, issueId });
      return;
    }

    if (action === "feedback") {
      vscode.postMessage({ type: "feedback", documentUri, issueId, sentiment });
    }
  });

  function render(state) {
    app.innerHTML = "";
    app.appendChild(renderHero(state));
    const statusBanner = renderProviderStatus(state);
    if (statusBanner) {
      app.appendChild(statusBanner);
    }

    if (state.mode === "empty") {
      app.appendChild(renderEmptyState(state));
      return;
    }

    if (state.mode === "unsupported") {
      app.appendChild(renderUnsupportedState(state));
      return;
    }

    app.appendChild(renderStats(state));

    if (state.mode === "clean") {
      app.appendChild(renderCleanState());
      return;
    }

    app.appendChild(renderIssueSection(state));
  }

  function renderHero(state) {
    const wrapper = createElement("section", "hero");
    wrapper.innerHTML = `
      <span class="eyebrow">Shield live</span>
      <h1>${escapeHtml(state.title || "CodeGuardian AI")}</h1>
      <p>${escapeHtml(state.subtitle || "Live debugging, explanations, and quick fixes.")}</p>
      <div class="hero-actions">
        <button class="button button-primary" data-action="analyze-now">Analyze now</button>
        <button
          class="button button-secondary"
          data-action="apply-all"
          data-document-uri="${escapeAttribute(state.documentUri || "")}"
          ${state.canApplyAll ? "" : "disabled"}
        >
          Apply all fixes
        </button>
        <button class="button button-secondary" data-action="open-summary">Session summary</button>
      </div>
    `;
    return wrapper;
  }

  function renderStats(state) {
    const section = createElement("section", "section");
    const stats = state.severityStats || [];
    const cards = [
      { label: "Language", value: state.languageLabel || "Code", tone: "info" },
      { label: "Issues", value: String(state.issueCount || 0), tone: "warning" },
      { label: "Quick fixes", value: String(state.fixableCount || 0), tone: "error" }
    ];

    const severityCards = stats.map((item) => ({
      label: item.label,
      value: String(item.count),
      tone: item.tone
    }));

    section.innerHTML = `
      <div class="stats-grid">
        ${cards.concat(severityCards).map(renderStatCard).join("")}
      </div>
    `;
    return section;
  }

  function renderCleanState() {
    const section = createElement("section", "section");
    section.innerHTML = `
      <div class="empty-state">
        <h3 class="section-title">All clear</h3>
        <p>Your active file has no CodeGuardian suggestions right now. Keep going.</p>
      </div>
    `;
    return section;
  }

  function renderEmptyState(state) {
    const section = createElement("section", "section");
    section.innerHTML = `
      <div class="empty-state">
        <h3 class="section-title">Ready when you are</h3>
        <p>${escapeHtml(state.subtitle || "")}</p>
        <div class="supported-list">
          ${(state.supportedLanguages || []).map((label) => `<span class="chip">${escapeHtml(label)}</span>`).join("")}
        </div>
      </div>
    `;
    return section;
  }

  function renderUnsupportedState(state) {
    const section = createElement("section", "section");
    section.innerHTML = `
      <div class="unsupported-state">
        <h3 class="section-title">Supported languages</h3>
        <p>${escapeHtml(state.subtitle || "")}</p>
        <div class="supported-list">
          ${(state.supportedLanguages || []).map((label) => `<span class="chip">${escapeHtml(label)}</span>`).join("")}
        </div>
      </div>
    `;
    return section;
  }

  function renderIssueSection(state) {
    const section = createElement("section", "section");
    const title = createElement("h3", "section-title");
    title.textContent = "Suggestions";
    section.appendChild(title);

    const list = createElement("div", "issue-list");
    for (const issue of state.suggestions || []) {
      list.appendChild(renderIssueCard(issue));
    }

    section.appendChild(list);
    return section;
  }

  function renderIssueCard(issue) {
    const card = createElement("article", "issue-card");
    card.innerHTML = `
      <div class="issue-header">
        <div>
          <h4 class="issue-title">${escapeHtml(issue.title)}</h4>
          <div class="issue-meta">
            <span class="badge badge-${escapeHtml(issue.severity)}">${escapeHtml(issue.severity)}</span>
            <span class="chip">Line ${escapeHtml(String(issue.line))}</span>
            <span class="chip">${escapeHtml(issue.category)}</span>
          </div>
        </div>
        <button
          class="button button-secondary"
          data-action="reveal"
          data-document-uri="${escapeAttribute(issue.documentUri)}"
          data-issue-id="${escapeAttribute(issue.issueId)}"
        >
          Go to code
        </button>
      </div>
      <div class="issue-body">
        <div class="copy-block">
          <span class="copy-label">Explanation</span>
          <p class="copy-text">${escapeHtml(issue.explanation)}</p>
        </div>
        <div class="copy-block">
          <span class="copy-label">Suggested change</span>
          <p class="copy-text">${escapeHtml(issue.suggestion)}</p>
        </div>
        ${renderPreview(issue)}
        <div class="issue-actions">
          ${
            issue.canApplyFix
              ? `
            <button
              class="button button-primary"
              data-action="apply-fix"
              data-document-uri="${escapeAttribute(issue.documentUri)}"
              data-issue-id="${escapeAttribute(issue.issueId)}"
            >
              ${escapeHtml(issue.fixLabel || "Apply fix")}
            </button>`
              : ""
          }
          <button
            class="button button-secondary"
            data-action="feedback"
            data-sentiment="helpful"
            data-document-uri="${escapeAttribute(issue.documentUri)}"
            data-issue-id="${escapeAttribute(issue.issueId)}"
          >
            Helpful
          </button>
          <button
            class="button button-secondary"
            data-action="feedback"
            data-sentiment="notHelpful"
            data-document-uri="${escapeAttribute(issue.documentUri)}"
            data-issue-id="${escapeAttribute(issue.issueId)}"
          >
            Needs work
          </button>
        </div>
        ${issue.learningNote ? `<p class="learning-note">${escapeHtml(issue.learningNote)}</p>` : ""}
      </div>
    `;
    return card;
  }

  function renderPreview(issue) {
    if (!issue.beforeLine || !issue.afterLine) {
      return "";
    }

    return `
      <div class="preview-grid">
        <div>
          <span class="copy-label">Current line</span>
          <pre class="preview-line">${escapeHtml(issue.beforeLine)}</pre>
        </div>
        <div>
          <span class="copy-label">After apply</span>
          <pre class="preview-line">${escapeHtml(issue.afterLine)}</pre>
        </div>
      </div>
    `;
  }

  function renderStatCard(card) {
    return `
      <div class="stat-card">
        <span class="stat-label">${escapeHtml(card.label)}</span>
        <span class="stat-value tone-${escapeHtml(card.tone || "info")}">${escapeHtml(card.value)}</span>
      </div>
    `;
  }

  function createElement(tagName, className) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    return element;
  }

  function renderProviderStatus(state) {
    const status = state.providerStatus;
    if (!status || status.state === "ready") {
      return null;
    }

    const wrapper = createElement("section", "section provider-status");
    wrapper.innerHTML = `
      <div class="status-card status-${escapeHtml(status.state)}">
        <strong>${escapeHtml(status.title || "CodeGuardian status")}</strong>
        <p>${escapeHtml(status.detail || "An issue occurred while fetching analysis status.")}</p>
      </div>
    `;
    return wrapper;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
