import path from "node:path";
import type { AuditReport, ReportItem, ReportSeverity, ReportStatus } from "../types/report.js";
import { writeTextFile } from "../utils/filesystem.js";

const STATUS_ORDER: Record<ReportStatus, number> = { fail: 0, warn: 1, skipped: 2, pass: 3 };
const SEVERITY_ORDER: Record<ReportSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function findingCard(item: ReportItem): string {
  const evidence = item.evidence?.length
    ? `<div class="evidence"><strong>Evidence</strong><ul>${item.evidence.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul></div>`
    : "";

  return `<article class="finding finding-${escapeHtml(item.status)}">
    <header class="finding-header">
      <div>
        <span class="status status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
        <span class="severity severity-${escapeHtml(item.severity)}">${escapeHtml(item.severity)}</span>
      </div>
      <code>${escapeHtml(item.checkName)}</code>
    </header>
    <p class="finding-text">${escapeHtml(item.finding)}</p>
    <p class="recommendation"><strong>Recommendation:</strong> ${escapeHtml(item.recommendation)}</p>
${evidence}
  </article>`;
}

function categorySections(items: ReportItem[]): string {
  const groups = new Map<string, ReportItem[]>();
  for (const item of items) {
    const existing = groups.get(item.category) ?? [];
    existing.push(item);
    groups.set(item.category, existing);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, categoryItems]) => {
      const sortedItems = [...categoryItems].sort(
        (left, right) =>
          STATUS_ORDER[left.status] - STATUS_ORDER[right.status] ||
          SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
          left.checkName.localeCompare(right.checkName),
      );
      return `<section class="category">
        <h2>${escapeHtml(category)} <span>${categoryItems.length} checks</span></h2>
        <div class="finding-list">${sortedItems.map(findingCard).join("\n")}</div>
      </section>`;
    })
    .join("\n");
}

function summaryCard(label: string, value: number, variant: string): string {
  return `<div class="summary-card summary-${variant}"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

export async function writeHtmlReport(report: AuditReport, outputDir: string): Promise<string> {
  const outputPath = path.join(outputDir, "qa-audit-report.html");
  const summary = report.summary;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QA Audit Report</title>
  <style>
    :root { color-scheme: light; --bg: #f4f7fb; --surface: #fff; --border: #d9e1ec; --text: #172033; --muted: #61708a; --pass: #147d55; --warn: #ad6400; --fail: #b42318; --skipped: #667085; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 Arial, sans-serif; }
    main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 56px; }
    h1 { margin: 0 0 6px; font-size: 30px; }
    h2 { display: flex; align-items: baseline; gap: 8px; margin: 30px 0 12px; font-size: 21px; text-transform: capitalize; }
    h2 span { color: var(--muted); font-size: 13px; font-weight: normal; }
    .meta, .narrative, .severity-panel { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
    .meta { display: grid; gap: 5px; margin: 18px 0; }
    .meta strong { display: inline-block; min-width: 92px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 14px 0; }
    .summary-card { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); padding: 12px 14px; }
    .summary-card span { display: block; color: var(--muted); font-size: 12px; text-transform: uppercase; }
    .summary-card strong { display: block; margin-top: 4px; font-size: 25px; }
    .summary-pass strong { color: var(--pass); } .summary-warn strong { color: var(--warn); } .summary-fail strong { color: var(--fail); } .summary-skipped strong { color: var(--skipped); }
    .severity-panel { color: var(--muted); }
    .severity-panel span { margin-right: 18px; }
    .finding-list { display: grid; gap: 10px; }
    .finding { border: 1px solid var(--border); border-left: 5px solid var(--border); border-radius: 8px; background: var(--surface); padding: 14px 16px; }
    .finding-fail { border-left-color: var(--fail); } .finding-warn { border-left-color: var(--warn); } .finding-pass { border-left-color: var(--pass); } .finding-skipped { border-left-color: var(--skipped); }
    .finding-header { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
    .status, .severity { display: inline-block; border-radius: 999px; padding: 2px 8px; margin-right: 5px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
    .status-pass { background: #e9f7f0; color: var(--pass); } .status-warn { background: #fff4dd; color: var(--warn); } .status-fail { background: #feecea; color: var(--fail); } .status-skipped { background: #eef0f3; color: var(--skipped); }
    .severity { background: #f0f4fa; color: #40516d; }
    code { color: #40516d; overflow-wrap: anywhere; }
    .finding-text { margin: 12px 0 7px; }
    .recommendation { margin: 0; color: #344054; }
    .evidence { margin-top: 10px; color: var(--muted); font-size: 13px; }
    .evidence ul { margin: 4px 0 0; padding-left: 20px; }
  </style>
</head>
<body>
<main>
  <h1>QA Audit Report</h1>
  <p>Structured quality review generated from the configured scanner pipeline.</p>
  <div class="meta">
    <div><strong>Generated</strong> ${escapeHtml(report.generatedAt)}</div>
    <div><strong>Target path</strong> ${escapeHtml(report.targetProjectPath)}</div>
${report.baseUrl ? `    <div><strong>Base URL</strong> ${escapeHtml(report.baseUrl)}</div>` : ""}
  </div>
  <h2>Overall Summary</h2>
  <div class="summary-grid">
    ${summaryCard("Total", summary.total, "total")}
    ${summaryCard("Pass", summary.pass, "pass")}
    ${summaryCard("Warn", summary.warn, "warn")}
    ${summaryCard("Fail", summary.fail, "fail")}
    ${summaryCard("Skipped", summary.skipped, "skipped")}
  </div>
  <p class="narrative">${escapeHtml(summary.narrative)}</p>
  <div class="severity-panel">
    <strong>Severity counts:</strong>
    <span>Critical ${summary.severityCounts.critical}</span>
    <span>High ${summary.severityCounts.high}</span>
    <span>Medium ${summary.severityCounts.medium}</span>
    <span>Low ${summary.severityCounts.low}</span>
    <span>Info ${summary.severityCounts.info}</span>
  </div>
  <h2>Findings</h2>
  ${categorySections(report.items)}
</main>
</body>
</html>
`;

  await writeTextFile(outputPath, html);
  return outputPath;
}
