import type { AuditConfig } from "./config.js";

export type ReportStatus = "pass" | "warn" | "fail" | "skipped";
export type ReportSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface ReportItem {
  scanner: string;
  category: string;
  checkName: string;
  status: ReportStatus;
  finding: string;
  severity: ReportSeverity;
  recommendation: string;
  evidence?: string[];
}

export interface ReportSummary {
  total: number;
  pass: number;
  warn: number;
  fail: number;
  skipped: number;
}

export interface AuditReport {
  generatedAt: string;
  targetProjectPath: string;
  summary: ReportSummary;
  items: ReportItem[];
}

export interface Scanner {
  readonly name: string;
  scan(config: AuditConfig): Promise<ReportItem[]>;
}
