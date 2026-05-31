import path from "node:path";
import type { ApiEndpointConfig, AuditConfig } from "../types/config.js";
import type { ReportItem, ReportSeverity, ReportStatus, Scanner } from "../types/report.js";
import { findFiles } from "../utils/filesystem.js";
import { fetchWithTiming, probeUrl } from "../utils/http.js";

const DEFAULT_LATENCY_WARN_MS = 1_000;
const CONTRACT_SOURCE_NAMES = new Set(["openapi.yaml", "openapi.yml", "openapi.json", "swagger.json"]);
const CONTRACT_SOURCE_DIRECTORIES = new Set(["routes", "controllers", "schema", "schemas"]);

function item(
  checkName: string,
  status: ReportStatus,
  severity: ReportSeverity,
  finding: string,
  recommendation: string,
  evidence?: string[],
): ReportItem {
  return {
    scanner: "api",
    category: "api",
    checkName,
    status,
    severity,
    finding,
    recommendation,
    ...(evidence && evidence.length > 0 ? { evidence } : {}),
  };
}

function endpointLabel(endpoint: ApiEndpointConfig, fallbackName: string): string {
  return endpoint.name?.trim() || fallbackName;
}

function buildUrl(baseUrl: string, endpointPath: string): string | undefined {
  try {
    return new URL(endpointPath, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function validateJsonShape(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed === null || (typeof parsed !== "object" && !Array.isArray(parsed))) {
      return "JSON response is valid but its top-level value is not an object or array.";
    }
    return undefined;
  } catch {
    return "Response content type indicates JSON, but the response body is not valid JSON.";
  }
}

async function checkEndpoint(
  baseUrl: string,
  endpoint: ApiEndpointConfig,
  fallbackName: string,
  latencyWarnMs: number,
): Promise<ReportItem> {
  const label = endpointLabel(endpoint, fallbackName);
  const url = buildUrl(baseUrl, endpoint.path);
  if (!url) {
    return item(
      `endpoint:${label}`,
      "warn",
      "medium",
      `${label} endpoint path could not be combined with the configured baseUrl.`,
      "Provide a valid endpoint path and absolute api.baseUrl in the audit config.",
      [endpoint.path],
    );
  }

  const result = await fetchWithTiming(url);
  if (!result.response) {
    return item(
      `endpoint:${label}`,
      "warn",
      "medium",
      `${label} endpoint request failed after ${result.durationMs}ms: ${result.error ?? "unknown request error"}`,
      "Verify the configured endpoint path and local service availability.",
      [url],
    );
  }

  const response = result.response;
  const expectedStatus = endpoint.expectedStatus ?? 200;
  const actualContentType = response.headers.get("content-type") ?? "";
  const expectedContentType = endpoint.expectedContentType;
  const problems: string[] = [];

  if (response.status !== expectedStatus) {
    problems.push(`expected status ${expectedStatus}, received ${response.status}`);
  }
  if (expectedContentType && !actualContentType.toLowerCase().includes(expectedContentType.toLowerCase())) {
    problems.push(`expected content type ${expectedContentType}, received ${actualContentType || "none"}`);
  }

  if (actualContentType.toLowerCase().includes("application/json")) {
    const jsonProblem = validateJsonShape(await response.text());
    if (jsonProblem) {
      problems.push(jsonProblem);
    }
  }
  if (result.durationMs > latencyWarnMs) {
    problems.push(`latency ${result.durationMs}ms exceeds warning threshold ${latencyWarnMs}ms`);
  }

  return problems.length > 0
    ? item(
        `endpoint:${label}`,
        "warn",
        "medium",
        `${label} endpoint check found issues: ${problems.join("; ")}.`,
        "Review the endpoint implementation, configured expectations, and latency baseline.",
        [url, `status=${response.status}`, `durationMs=${result.durationMs}`, `contentType=${actualContentType || "none"}`],
      )
    : item(
        `endpoint:${label}`,
        "pass",
        "info",
        `${label} endpoint returned status ${response.status} in ${result.durationMs}ms with the expected basic response shape.`,
        "Keep endpoint expectations current as the API contract evolves.",
        [url, `status=${response.status}`, `durationMs=${result.durationMs}`, `contentType=${actualContentType || "none"}`],
      );
}

async function discoverStaticApiHints(projectPath: string): Promise<string[]> {
  const files = await findFiles(projectPath);
  const evidence = new Set<string>();

  for (const filePath of files) {
    const relativePath = path.relative(projectPath, filePath).replaceAll("\\", "/");
    const parts = relativePath.split("/");
    const fileName = path.basename(filePath).toLowerCase();
    if (CONTRACT_SOURCE_NAMES.has(fileName)) {
      evidence.add(relativePath);
    }
    if (parts.some((part) => CONTRACT_SOURCE_DIRECTORIES.has(part.toLowerCase()))) {
      const sourceDirectory = parts.find((part) => CONTRACT_SOURCE_DIRECTORIES.has(part.toLowerCase()));
      if (sourceDirectory) {
        evidence.add(`${sourceDirectory}/`);
      }
    }
  }

  return [...evidence].sort();
}

async function staticFallback(projectPath: string): Promise<ReportItem> {
  const hints = await discoverStaticApiHints(projectPath);
  return hints.length > 0
    ? item(
        "static-contract-fallback",
        "warn",
        "info",
        "API runtime checks were skipped, but possible API contract or source hints were found for future static analysis.",
        "Use the discovered files or directories to add static contract extraction when runtime services are unavailable.",
        hints,
      )
    : item(
        "static-contract-fallback",
        "warn",
        "low",
        "API runtime checks were skipped and no common API contract or source hints were found.",
        "Add an OpenAPI file or document route, controller, and schema locations to support dormant-project API analysis.",
      );
}

async function scanApi(config: AuditConfig): Promise<ReportItem[]> {
  const api = config.api;
  if (!api?.baseUrl) {
    return [
      item(
        "api-runtime",
        "skipped",
        "info",
        "API runtime checks skipped because api.baseUrl is not configured.",
        "Configure api.baseUrl and endpoint expectations to enable runtime API checks.",
      ),
      await staticFallback(config.projectPath),
    ];
  }

  const reachabilityUrl = buildUrl(api.baseUrl, api.healthEndpoint?.path ?? "/");
  if (!reachabilityUrl) {
    return [
      item(
        "api-runtime",
        "skipped",
        "low",
        "API runtime checks skipped because api.baseUrl or the configured health endpoint path is invalid.",
        "Provide a valid absolute api.baseUrl and endpoint paths in the audit config.",
      ),
      await staticFallback(config.projectPath),
    ];
  }

  const reachability = await probeUrl(reachabilityUrl);
  if (!reachability.reachable) {
    return [
      item(
        "api-runtime",
        "skipped",
        "info",
        "API runtime checks skipped because the configured local service is unreachable.",
        "Start the local API service and rerun the audit. Review static fallback evidence while the service is dormant.",
        [reachabilityUrl],
      ),
      await staticFallback(config.projectPath),
    ];
  }

  const latencyWarnMs = api.latencyWarnMs ?? DEFAULT_LATENCY_WARN_MS;
  const findings: ReportItem[] = [
    item(
      "api-runtime",
      "pass",
      "info",
      `API runtime service is reachable at the configured baseUrl.`,
      "Review configured endpoint findings and keep the runtime target configuration current.",
      [api.baseUrl],
    ),
  ];

  if (api.healthEndpoint) {
    findings.push(await checkEndpoint(api.baseUrl, api.healthEndpoint, "Health", latencyWarnMs));
  } else {
    findings.push(
      item(
        "health-endpoint",
        "skipped",
        "info",
        "Health endpoint check skipped because api.healthEndpoint is not configured.",
        "Configure a health endpoint with path and expectedStatus for repeatable service readiness checks.",
      ),
    );
  }

  if (!api.endpoints || api.endpoints.length === 0) {
    findings.push(
      item(
        "configured-endpoints",
        "skipped",
        "info",
        "API endpoint checks skipped because no api.endpoints are configured.",
        "Add a small set of representative API endpoints with expected statuses and content types.",
      ),
    );
  } else {
    for (const [index, endpoint] of api.endpoints.entries()) {
      findings.push(await checkEndpoint(api.baseUrl, endpoint, `Endpoint ${index + 1}`, latencyWarnMs));
    }
  }

  return findings;
}

export const apiScanner: Scanner = {
  name: "api",
  async scan(config) {
    try {
      return await scanApi(config);
    } catch (error) {
      return [
        item(
          "api-scan",
          "fail",
          "high",
          `API scan could not complete: ${error instanceof Error ? error.message : "unknown error"}`,
          "Check API configuration and local service behavior, then rerun the audit.",
        ),
      ];
    }
  },
};
