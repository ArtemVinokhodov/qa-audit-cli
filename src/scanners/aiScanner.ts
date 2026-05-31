import type { Scanner } from "../types/report.js";

export const aiScanner: Scanner = {
  name: "ai-risk-review",
  async scan(config) {
    return [
      {
        scanner: this.name,
        status: "skipped",
        severity: "info",
        finding: config.ai?.enabled
          ? "AI risk review is enabled in config but remains a placeholder."
          : "AI risk review is optional and disabled.",
        recommendation: "Implement bounded AI analysis with a documented no-key fallback.",
      },
    ];
  },
};
