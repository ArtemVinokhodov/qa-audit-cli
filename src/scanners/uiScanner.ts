import type { Scanner } from "../types/report.js";

export const uiScanner: Scanner = {
  name: "ui",
  async scan(config) {
    return [
      {
        scanner: this.name,
        category: "ui",
        checkName: "ui-placeholder",
        status: "skipped",
        severity: "info",
        finding: config.ui?.baseUrl
          ? "UI scanner placeholder found configured browser context but did not launch Playwright."
          : "UI scanner placeholder skipped because UI runtime context is not configured.",
        recommendation: "Implement reachability probing and Playwright browser checks.",
      },
    ];
  },
};
