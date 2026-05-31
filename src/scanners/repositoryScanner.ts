import type { Scanner } from "../types/report.js";

export const repositoryScanner: Scanner = {
  name: "repository",
  async scan(config) {
    return [
      {
        scanner: this.name,
        status: "pass",
        severity: "info",
        finding: `Repository scanner placeholder is configured for ${config.projectPath}.`,
        recommendation: "Implement manifest, lock file, ignore file, CI, and lint configuration checks.",
      },
    ];
  },
};
