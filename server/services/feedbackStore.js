const fs = require("fs/promises");
const path = require("path");

class FeedbackStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async ensureFile() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch (error) {
      await fs.writeFile(
        this.filePath,
        JSON.stringify({ feedback: [], updatedAt: null }, null, 2),
        "utf8"
      );
    }
  }

  async readAll() {
    await this.ensureFile();
    const raw = await fs.readFile(this.filePath, "utf8");
    return JSON.parse(raw);
  }

  async writeAll(payload) {
    await this.ensureFile();
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  async saveFeedback(entry) {
    const payload = await this.readAll();
    payload.feedback.push(entry);
    payload.updatedAt = new Date().toISOString();
    await this.writeAll(payload);
    return entry;
  }

  async getFeedbackProfile() {
    const payload = await this.readAll();
    return payload.feedback.reduce((profile, item) => {
      if (!profile[item.ruleId]) {
        profile[item.ruleId] = { helpful: 0, notHelpful: 0 };
      }

      if (item.sentiment === "helpful") {
        profile[item.ruleId].helpful += 1;
      } else {
        profile[item.ruleId].notHelpful += 1;
      }

      return profile;
    }, {});
  }

  async getSummary() {
    const payload = await this.readAll();
    const profile = await this.getFeedbackProfile();
    return {
      totalFeedback: payload.feedback.length,
      rules: profile,
      recent: payload.feedback.slice(-20).reverse()
    };
  }
}

function createFeedbackStore(filePath) {
  return new FeedbackStore(filePath);
}

module.exports = {
  FeedbackStore,
  createFeedbackStore
};
