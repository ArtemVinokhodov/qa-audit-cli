import path from "node:path";
import type { AuditReport } from "../types/report.js";
import { writeTextFile } from "../utils/filesystem.js";

export async function writeJsonReport(report: AuditReport, outputDir: string): Promise<string> {
  const outputPath = path.join(outputDir, "qa-audit-report.json");
  await writeTextFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return outputPath;
}
