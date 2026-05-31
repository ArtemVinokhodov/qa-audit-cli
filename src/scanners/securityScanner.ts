import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { AuditConfig } from "../types/config.js";
import type { ReportItem, ReportSeverity, ReportStatus, Scanner } from "../types/report.js";
import { findFiles, pathExists, readTextFileIfExists } from "../utils/filesystem.js";
import { probeUrl } from "../utils/http.js";

const execFileAsync = promisify(execFile);
const MAX_SCANNED_FILE_BYTES = 256_000;
const SAFE_TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".env",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".properties",
  ".py",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const SAFE_TEXT_FILENAMES = new Set(["Dockerfile", "Pipfile"]);
const SECRET_PATTERNS = [
  { name: "API_KEY assignment", pattern: /\b[A-Z0-9_]*API_KEY\s*=/i },
  { name: "SECRET assignment", pattern: /\b[A-Z0-9_]*SECRET\s*=/i },
  { name: "TOKEN assignment", pattern: /\b[A-Z0-9_]*TOKEN\s*=/i },
  { name: "PRIVATE_KEY marker", pattern: /\bPRIVATE_KEY\b/i },
  { name: "sk_ prefix", pattern: /\bsk_[a-z0-9_-]+/i },
];
const SECURITY_HEADERS = [
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
];
const DEBUG_ENDPOINTS = ["/debug", "/api-docs", "/swagger", "/swagger.json"];

function item(
  checkName: string,
  status: ReportStatus,
  severity: ReportSeverity,
  finding: string,
  recommendation: string,
  evidence?: string[],
): ReportItem {
  return {
    scanner: "security",
    category: "security",
    checkName,
    status,
    severity,
    finding,
    recommendation,
    ...(evidence && evidence.length > 0 ? { evidence } : {}),
  };
}

function relativeEvidence(projectPath: string, filePath: string): string {
  return path.relative(projectPath, filePath).replaceAll("\\", "/");
}

async function scanEnvFiles(projectPath: string): Promise<ReportItem> {
  const files = await findFiles(projectPath);
  const envFiles = files
    .filter((filePath) => {
      const name = path.basename(filePath);
      return name === ".env" || (name.startsWith(".env.") && name !== ".env.example");
    })
    .map((filePath) => relativeEvidence(projectPath, filePath));

  return envFiles.length > 0
    ? item(
        "env-files",
        "warn",
        "high",
        `Potentially sensitive environment file${envFiles.length === 1 ? "" : "s"} found in the target project.`,
        "Remove environment files from version control, keep only sanitized examples, and rotate any real credentials that may have been committed.",
        envFiles,
      )
    : item(
        "env-files",
        "pass",
        "info",
        "No non-example .env files were found in the target project.",
        "Keep real environment files out of version control and provide sanitized .env.example files where useful.",
      );
}

function isSafeTextFile(filePath: string): boolean {
  return SAFE_TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase()) || SAFE_TEXT_FILENAMES.has(path.basename(filePath));
}

async function scanSecretLikePatterns(projectPath: string): Promise<ReportItem> {
  const evidence: string[] = [];
  const files = (await findFiles(projectPath)).filter(isSafeTextFile);

  for (const filePath of files) {
    const contents = await readTextFileIfExists(filePath);
    if (contents === undefined || Buffer.byteLength(contents, "utf8") > MAX_SCANNED_FILE_BYTES) {
      continue;
    }

    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(contents)) {
        evidence.push(`${relativeEvidence(projectPath, filePath)}: ${name}`);
      }
    }
  }

  return evidence.length > 0
    ? item(
        "secret-like-patterns",
        "warn",
        "high",
        `Found ${evidence.length} secret-like pattern match${evidence.length === 1 ? "" : "es"} in selected text files. Matches are heuristic and may include safe fixtures or placeholders.`,
        "Review each match. Move real secrets to environment variables or a secret manager and rotate any credential that may have been exposed.",
        evidence,
      )
    : item(
        "secret-like-patterns",
        "pass",
        "info",
        "No secret-like patterns were found in the selected text files.",
        "Continue using environment variables or a secret manager and review false-negative risk separately.",
      );
}

interface NpmAuditSummary {
  critical: number;
  high: number;
}

function parseNpmAuditSummary(output: string): NpmAuditSummary | undefined {
  try {
    const parsed = JSON.parse(output) as {
      metadata?: { vulnerabilities?: Partial<Record<"critical" | "high", number>> };
    };
    return {
      critical: parsed.metadata?.vulnerabilities?.critical ?? 0,
      high: parsed.metadata?.vulnerabilities?.high ?? 0,
    };
  } catch {
    return undefined;
  }
}

async function scanDependencyAudit(projectPath: string): Promise<ReportItem> {
  const packageJsonPath = path.join(projectPath, "package.json");
  const packageLockPath = path.join(projectPath, "package-lock.json");
  if (!(await pathExists(packageJsonPath))) {
    return item(
      "dependency-audit",
      "skipped",
      "info",
      "npm dependency audit skipped because package.json was not found.",
      "Run an ecosystem-appropriate dependency audit if the project uses another package manager.",
    );
  }
  if (!(await pathExists(packageLockPath))) {
    return item(
      "dependency-audit",
      "skipped",
      "low",
      "npm dependency audit skipped because package-lock.json was not found.",
      "Commit package-lock.json or run an audit appropriate for the selected Node package manager.",
    );
  }

  try {
    const executable = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "npm";
    const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm audit --json"] : ["audit", "--json"];
    const { stdout } = await execFileAsync(executable, args, {
      cwd: projectPath,
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
    return dependencyAuditResult(stdout);
  } catch (error) {
    const failedAudit = error as { stdout?: string; message?: string };
    if (failedAudit.stdout) {
      const parsedResult = dependencyAuditResult(failedAudit.stdout);
      if (parsedResult.status !== "skipped") {
        return parsedResult;
      }
    }

    return item(
      "dependency-audit",
      "skipped",
      "low",
      `npm audit could not complete: ${failedAudit.message ?? "unknown npm audit error"}`,
      "Run npm audit manually with registry access and review dependency vulnerabilities.",
    );
  }
}

function dependencyAuditResult(output: string): ReportItem {
  const summary = parseNpmAuditSummary(output);
  if (!summary) {
    return item(
      "dependency-audit",
      "skipped",
      "low",
      "npm audit returned output that could not be parsed.",
      "Run npm audit manually and review the dependency vulnerability report.",
    );
  }

  if (summary.critical > 0 || summary.high > 0) {
    return item(
      "dependency-audit",
      "warn",
      summary.critical > 0 ? "critical" : "high",
      `npm audit reported ${summary.critical} critical and ${summary.high} high severity vulnerabilities.`,
      "Review npm audit details, upgrade affected dependencies, and verify fixes before release.",
      [`critical=${summary.critical}`, `high=${summary.high}`],
    );
  }

  return item(
    "dependency-audit",
    "pass",
    "info",
    "npm audit reported no critical or high severity vulnerabilities.",
    "Continue monitoring dependency advisories and review lower severity findings separately.",
  );
}

async function scanRiskyScripts(projectPath: string): Promise<ReportItem> {
  const packageJson = await readTextFileIfExists(path.join(projectPath, "package.json"));
  if (!packageJson) {
    return item(
      "risky-scripts",
      "skipped",
      "info",
      "package.json scripts check skipped because package.json was not found.",
      "Review startup scripts manually for externally exposed debug modes.",
    );
  }

  try {
    const parsed = JSON.parse(packageJson) as { scripts?: Record<string, string> };
    const riskyScripts = Object.entries(parsed.scripts ?? {})
      .filter(([, command]) => /(?:--inspect(?:-brk)?\b|--debug\b|0\.0\.0\.0)/i.test(command))
      .map(([name]) => name);

    return riskyScripts.length > 0
      ? item(
          "risky-scripts",
          "warn",
          "medium",
          "Some package.json scripts may expose debug mode or bind services to all network interfaces.",
          "Review the flagged scripts and keep debug interfaces restricted to trusted local development environments.",
          riskyScripts.map((name) => `package.json script: ${name}`),
        )
      : item(
          "risky-scripts",
          "pass",
          "info",
          "No obvious debug exposure patterns were found in package.json scripts.",
          "Continue reviewing runtime deployment configuration separately.",
        );
  } catch {
    return item(
      "risky-scripts",
      "skipped",
      "low",
      "package.json scripts check skipped because package.json could not be parsed.",
      "Fix package.json syntax and review startup scripts manually.",
    );
  }
}

function runtimeBaseUrl(config: AuditConfig): string | undefined {
  return config.api?.baseUrl ?? config.ui?.baseUrl;
}

async function fetchRuntimeResponse(url: string): Promise<Response | undefined> {
  try {
    return await fetch(url, { method: "GET", signal: AbortSignal.timeout(3_000) });
  } catch {
    return undefined;
  }
}

async function scanRuntime(config: AuditConfig): Promise<ReportItem[]> {
  const baseUrl = runtimeBaseUrl(config);
  if (!baseUrl) {
    return [
      item(
        "runtime-security",
        "skipped",
        "info",
        "Runtime security checks skipped because no API or UI baseUrl is configured.",
        "Configure a local runtime baseUrl to enable security header, CORS, and debug endpoint checks.",
      ),
    ];
  }

  let rootUrl: string;
  try {
    rootUrl = new URL("/", baseUrl).toString();
  } catch {
    return [
      item(
        "runtime-security",
        "skipped",
        "low",
        "Runtime security checks skipped because the configured baseUrl is invalid.",
        "Provide a valid absolute API or UI baseUrl in the audit config.",
      ),
    ];
  }

  const reachability = await probeUrl(rootUrl);
  if (!reachability.reachable) {
    return [
      item(
        "runtime-security",
        "skipped",
        "info",
        "Runtime security checks skipped because the configured service is unreachable.",
        "Start the local target service and rerun the audit to inspect runtime security behavior.",
        [rootUrl],
      ),
    ];
  }

  const response = await fetchRuntimeResponse(rootUrl);
  if (!response) {
    return [
      item(
        "runtime-security",
        "skipped",
        "low",
        "Runtime security checks skipped because the reachable service could not be fetched consistently.",
        "Verify local service stability and rerun the audit.",
        [rootUrl],
      ),
    ];
  }

  const missingHeaders = SECURITY_HEADERS.filter((header) => !response.headers.has(header));
  const findings: ReportItem[] = [
    missingHeaders.length > 0
      ? item(
          "security-headers",
          "warn",
          "medium",
          `Runtime response is missing recommended security headers: ${missingHeaders.join(", ")}.`,
          "Configure the service or reverse proxy to send appropriate browser security headers.",
          [rootUrl],
        )
      : item(
          "security-headers",
          "pass",
          "info",
          "Runtime response includes the checked browser security headers.",
          "Keep header policies reviewed as application behavior evolves.",
          [rootUrl],
        ),
  ];

  const cors = response.headers.get("access-control-allow-origin");
  findings.push(
    cors === "*"
      ? item(
          "cors-policy",
          "warn",
          "medium",
          "Runtime response allows requests from any origin with Access-Control-Allow-Origin: *.",
          "Restrict CORS to explicitly trusted origins unless unrestricted public access is intentional.",
          [rootUrl],
        )
      : item(
          "cors-policy",
          "pass",
          "info",
          cors ? "Runtime response does not use wildcard CORS." : "Runtime response does not expose an Access-Control-Allow-Origin header.",
          "Confirm the observed CORS behavior matches the intended client access policy.",
          [rootUrl],
        ),
  );

  const exposedDebugEndpoints: string[] = [];
  for (const endpoint of DEBUG_ENDPOINTS) {
    const endpointUrl = new URL(endpoint, baseUrl).toString();
    const endpointResponse = await fetchRuntimeResponse(endpointUrl);
    if (endpointResponse?.ok) {
      exposedDebugEndpoints.push(`${endpoint} (${endpointResponse.status})`);
    }
  }
  findings.push(
    exposedDebugEndpoints.length > 0
      ? item(
          "debug-endpoints",
          "warn",
          "medium",
          "One or more common debug or API documentation endpoints returned successful responses.",
          "Confirm each exposed endpoint is intentional and restrict sensitive debug or documentation routes outside trusted environments.",
          exposedDebugEndpoints,
        )
      : item(
          "debug-endpoints",
          "pass",
          "info",
          "No common debug or API documentation endpoints returned a successful response.",
          "Continue reviewing framework-specific debug routes separately.",
        ),
  );

  return findings;
}

async function scanSecurity(config: AuditConfig): Promise<ReportItem[]> {
  const staticFindings = await Promise.all([
    scanEnvFiles(config.projectPath),
    scanSecretLikePatterns(config.projectPath),
    scanDependencyAudit(config.projectPath),
    scanRiskyScripts(config.projectPath),
  ]);
  return [...staticFindings, ...(await scanRuntime(config))];
}

export const securityScanner: Scanner = {
  name: "security",
  async scan(config) {
    try {
      return await scanSecurity(config);
    } catch (error) {
      return [
        item(
          "security-scan",
          "fail",
          "high",
          `Security scan could not complete: ${error instanceof Error ? error.message : "unknown error"}`,
          "Check target filesystem permissions and runtime configuration, then rerun the audit.",
        ),
      ];
    }
  },
};
