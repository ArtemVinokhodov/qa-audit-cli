import type { Scanner } from "../types/report.js";

export const apiScanner: Scanner = {
  name: "api",
  async scan(config) {
    return [
      {
        scanner: this.name,
        category: "api",
        checkName: "api-placeholder",
        status: "skipped",
        severity: "info",
        finding: config.api?.baseUrl
          ? "API scanner placeholder found configured runtime context but did not probe it."
          : "API scanner placeholder skipped because API runtime context is not configured.",
        recommendation: "Implement reachability probing before API runtime checks.",
      },
    ];
  },
};
