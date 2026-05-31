import path from "node:path";
import type { AuditReport } from "../types/report.js";
import { writeTextFile } from "../utils/filesystem.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function writeHtmlReport(report: AuditReport, outputDir: string): Promise<string> {
  const outputPath = path.join(outputDir, "qa-audit-report.html");
  const rows = report.items
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.scanner)}</td>
        <td>${escapeHtml(item.status)}</td>
        <td>${escapeHtml(item.severity)}</td>
        <td>${escapeHtml(item.finding)}</td>
        <td>${escapeHtml(item.recommendation)}</td>
      </tr>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>QA Audit Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 2rem; color: #202938; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d7dde5; padding: 0.6rem; text-align: left; vertical-align: top; }
    th { background: #eef3f8; }
  </style>
</head>
<body>
  <h1>QA Audit Report</h1>
  <p>Generated: ${escapeHtml(report.generatedAt)}</p>
  <p>Target: ${escapeHtml(report.targetProjectPath)}</p>
  <h2>Overall Summary</h2>
  <p>Total: ${report.summary.total}; Pass: ${report.summary.pass}; Warn: ${report.summary.warn}; Fail: ${report.summary.fail}; Skipped: ${report.summary.skipped}</p>
  <h2>Findings</h2>
  <table>
    <thead><tr><th>Scanner</th><th>Status</th><th>Severity</th><th>Finding</th><th>Recommendation</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>
`;

  await writeTextFile(outputPath, html);
  return outputPath;
}
