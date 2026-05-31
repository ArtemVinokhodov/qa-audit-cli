import { loadConfig } from "./config/loadConfig.js";
import { writeHtmlReport } from "./reporters/htmlReporter.js";
import { writeJsonReport } from "./reporters/jsonReporter.js";
import { scanners } from "./scanners/index.js";
import type { AuditReport, ReportItem, ReportSummary } from "./types/report.js";
import { logError, logInfo } from "./utils/logger.js";

function readConfigPath(args: string[]): string | undefined {
  const configFlagIndex = args.lastIndexOf("--config");
  if (configFlagIndex === -1) {
    return undefined;
  }

  const configPath = args[configFlagIndex + 1];
  if (!configPath) {
    throw new Error("Expected a path after --config.");
  }
  return configPath;
}

function createNarrative(summary: Omit<ReportSummary, "narrative">): string {
  if (summary.fail > 0) {
    return `Audit completed with ${summary.fail} failed check${summary.fail === 1 ? "" : "s"} and ${summary.warn} warning${summary.warn === 1 ? "" : "s"}. Prioritize failed checks before release.`;
  }
  if (summary.warn > 0) {
    return `Audit completed without failed checks. Review ${summary.warn} warning${summary.warn === 1 ? "" : "s"} and confirm whether each risk is acceptable or requires remediation.`;
  }
  if (summary.skipped > 0) {
    return `Audit completed without failures or warnings. ${summary.skipped} check${summary.skipped === 1 ? " was" : "s were"} skipped because optional context was unavailable.`;
  }
  return "Audit completed with all checks passing.";
}

function createSummary(items: ReportItem[]): ReportSummary {
  const counts = items.reduce<Omit<ReportSummary, "narrative">>(
    (summary, item) => {
      summary.total += 1;
      summary[item.status] += 1;
      summary.severityCounts[item.severity] += 1;
      return summary;
    },
    {
      total: 0,
      pass: 0,
      warn: 0,
      fail: 0,
      skipped: 0,
      severityCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    },
  );

  return { ...counts, narrative: createNarrative(counts) };
}

async function run(): Promise<void> {
  const config = await loadConfig(readConfigPath(process.argv.slice(2)));
  logInfo(`Loaded config for ${config.projectPath}`);

  const items: ReportItem[] = [];
  for (const scanner of scanners) {
    logInfo(`Running ${scanner.name} scanner`);
    items.push(...(await scanner.scan(config)));
  }

  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    targetProjectPath: config.projectPath,
    baseUrl: config.api?.baseUrl ?? config.ui?.baseUrl,
    summary: createSummary(items),
    items,
  };

  const jsonPath = await writeJsonReport(report, config.report.outputDir);
  const htmlPath = await writeHtmlReport(report, config.report.outputDir);
  logInfo(`JSON report: ${jsonPath}`);
  logInfo(`HTML report: ${htmlPath}`);
}

run().catch((error: unknown) => {
  logError(error instanceof Error ? error.message : "Unknown audit failure");
  process.exitCode = 1;
});
