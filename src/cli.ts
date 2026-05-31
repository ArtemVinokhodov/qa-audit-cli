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

function createSummary(items: ReportItem[]): ReportSummary {
  return items.reduce<ReportSummary>(
    (summary, item) => {
      summary.total += 1;
      summary[item.status] += 1;
      return summary;
    },
    { total: 0, pass: 0, warn: 0, fail: 0, skipped: 0 },
  );
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
    summary: createSummary(items),
    items,
  };

  const jsonPath = await writeJsonReport(report, config.outputDir);
  const htmlPath = await writeHtmlReport(report, config.outputDir);
  logInfo(`JSON report: ${jsonPath}`);
  logInfo(`HTML report: ${htmlPath}`);
}

run().catch((error: unknown) => {
  logError(error instanceof Error ? error.message : "Unknown audit failure");
  process.exitCode = 1;
});
