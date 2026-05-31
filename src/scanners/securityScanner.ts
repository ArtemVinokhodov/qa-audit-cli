import type { Scanner } from "../types/report.js";

export const securityScanner: Scanner = {
  name: "security",
  async scan() {
    return [
      {
        scanner: this.name,
        status: "skipped",
        severity: "info",
        finding: "Security scanner placeholder has not executed static or runtime checks.",
        recommendation: "Implement secret heuristics, dependency audit support, and runtime header checks.",
      },
    ];
  },
};
