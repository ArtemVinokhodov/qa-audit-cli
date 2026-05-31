import path from "node:path";
import type { AuditConfig } from "../types/config.js";
import type { ReportItem, ReportSeverity, ReportStatus, Scanner } from "../types/report.js";
import { findFiles, readTextFileIfExists } from "../utils/filesystem.js";

const DEFAULT_API_KEY_ENV = "OPENAI_API_KEY";
const DEFAULT_MAX_FILES = 8;
const MAX_FILE_CHARACTERS = 6_000;
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

function item(
  checkName: string,
  status: ReportStatus,
  severity: ReportSeverity,
  finding: string,
  recommendation: string,
  evidence?: string[],
): ReportItem {
  return {
    scanner: "ai-risk-review",
    category: "ai",
    checkName,
    status,
    severity,
    finding,
    recommendation,
    ...(evidence && evidence.length > 0 ? { evidence } : {}),
  };
}

function relativePath(projectPath: string, filePath: string): string {
  return path.relative(projectPath, filePath).replaceAll("\\", "/");
}

function isAiReviewCandidate(projectPath: string, filePath: string): boolean {
  const relative = relativePath(projectPath, filePath);
  const parts = relative.toLowerCase().split("/");
  const fileName = path.basename(relative).toLowerCase();

  return (
    fileName === "readme.md" ||
    fileName === "package.json" ||
    fileName === "openapi.yaml" ||
    fileName === "openapi.yml" ||
    fileName === "openapi.json" ||
    fileName === "swagger.json" ||
    parts.some((part) => ["routes", "controllers", "schema", "schemas"].includes(part))
  );
}

async function selectAiReviewFiles(projectPath: string, maxFiles: number): Promise<Array<{ path: string; contents: string }>> {
  const candidates = (await findFiles(projectPath))
    .filter((filePath) => isAiReviewCandidate(projectPath, filePath))
    .sort((left, right) => relativePath(projectPath, left).localeCompare(relativePath(projectPath, right)))
    .slice(0, maxFiles);
  const selected: Array<{ path: string; contents: string }> = [];

  for (const filePath of candidates) {
    const contents = await readTextFileIfExists(filePath);
    if (contents !== undefined) {
      selected.push({
        path: relativePath(projectPath, filePath),
        contents: contents.slice(0, MAX_FILE_CHARACTERS),
      });
    }
  }

  return selected;
}

function readmeDocumentationFindings(readme: string | undefined): ReportItem[] {
  const documentation = readme?.toLowerCase() ?? "";
  const checks = [
    {
      checkName: "fallback:install-command",
      present: /\bnpm\s+(?:install|ci)\b|\byarn\s+install\b|\bpnpm\s+install\b|\bpip\s+install\b|\bmvn\s+install\b/.test(documentation),
      finding: "Setup documentation does not show an install command.",
      recommendation: "Document one reproducible dependency installation command.",
    },
    {
      checkName: "fallback:run-command",
      present: /\bnpm\s+(?:run\s+)?start\b|\bnode\s+\S+|\bpython\s+\S+|\bgo\s+run\b|\bmvn\s+\S*spring-boot:run\b/.test(documentation),
      finding: "Setup documentation does not show how to run the target project.",
      recommendation: "Document the command required to start the local project.",
    },
    {
      checkName: "fallback:environment-documentation",
      present: /\.env\b|environment variable|environment variables|\benv var/i.test(readme ?? ""),
      finding: "Setup documentation does not describe environment-variable requirements.",
      recommendation: "Document required and optional environment variables, using safe example values only.",
    },
    {
      checkName: "fallback:test-or-audit-command",
      present: /\bnpm\s+(?:run\s+)?(?:test|audit)\b|\byarn\s+(?:test|audit)\b|\bpnpm\s+(?:test|audit)\b|\bpytest\b|\bgo\s+test\b|\bmvn\s+test\b/.test(documentation),
      finding: "Setup documentation does not show a test or audit command.",
      recommendation: "Document at least one validation command and the expected result.",
    },
  ];

  const findings = checks
    .filter(({ present }) => !present)
    .map(({ checkName, finding, recommendation }) => item(checkName, "warn", "low", finding, recommendation, ["README.md"]));

  return findings.length > 0
    ? findings
    : [
        item(
          "fallback:documentation-baseline",
          "pass",
          "info",
          "README setup documentation includes install, run, environment-variable, and test or audit guidance.",
          "Keep setup documentation synchronized with the project workflow.",
          ["README.md"],
        ),
      ];
}

async function heuristicFallback(config: AuditConfig, reason: string): Promise<ReportItem[]> {
  const readme = await readTextFileIfExists(path.join(config.projectPath, "README.md"));
  return [
    item(
      "llm-execution",
      "skipped",
      "info",
      `LLM analysis was not executed: ${reason}`,
      "Configure OPENAI_API_KEY only when paid contextual AI review is intended. The deterministic fallback remains available without it.",
    ),
    ...readmeDocumentationFindings(readme),
  ];
}

interface AiRisk {
  severity?: unknown;
  finding?: unknown;
  recommendation?: unknown;
  evidence?: unknown;
}

function parseSeverity(value: unknown): ReportSeverity {
  return ["critical", "high", "medium", "low", "info"].includes(String(value))
    ? (String(value) as ReportSeverity)
    : "medium";
}

function extractResponseText(response: unknown): string | undefined {
  const responseObject = response as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown }> }>;
  };
  if (typeof responseObject.output_text === "string") {
    return responseObject.output_text;
  }

  const text = responseObject.output
    ?.flatMap((output) => output.content ?? [])
    .map((content) => content.text)
    .find((value): value is string => typeof value === "string");
  return text;
}

function parseAiRisks(text: string): AiRisk[] | undefined {
  const normalized = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed: unknown = JSON.parse(normalized);
    return Array.isArray(parsed) ? (parsed as AiRisk[]) : undefined;
  } catch {
    return undefined;
  }
}

function aiRiskItems(risks: AiRisk[]): ReportItem[] {
  const findings = risks
    .filter((risk) => typeof risk.finding === "string" && typeof risk.recommendation === "string")
    .slice(0, 6)
    .map((risk, index) =>
      item(
        `llm-risk:${index + 1}`,
        "warn",
        parseSeverity(risk.severity),
        String(risk.finding),
        String(risk.recommendation),
        Array.isArray(risk.evidence) ? risk.evidence.filter((value): value is string => typeof value === "string") : undefined,
      ),
    );

  return findings.length > 0
    ? findings
    : [
        item(
          "llm-risk-review",
          "pass",
          "info",
          "LLM contextual review returned no additional documentation or contract risks.",
          "Continue using deterministic checks and periodically review documentation quality manually.",
        ),
      ];
}

function createPrompt(files: Array<{ path: string; contents: string }>): string {
  const context = files.map((file) => `--- FILE: ${file.path} ---\n${file.contents}`).join("\n\n");
  return `You are performing a bounded QA risk review of local project documentation and contract-related files.
Identify quality risks that simple missing-file checks cannot reliably assess:
- ambiguous setup instructions
- unclear API contracts
- missing error-handling expectations
- missing test strategy
- risky assumptions

Do not invent facts. Return only a JSON array with at most 6 objects.
Each object must have: severity ("high", "medium", "low", or "info"), finding, recommendation, evidence (array of file paths).

Project files:
${context}`;
}

async function runOpenAiReview(config: AuditConfig, apiKey: string): Promise<ReportItem[]> {
  const ai = config.ai;
  if (ai?.provider && ai.provider !== "openai") {
    return heuristicFallback(config, `provider "${ai.provider}" is not supported`);
  }
  if (!ai?.model) {
    return heuristicFallback(config, "ai.model is not configured");
  }

  const files = await selectAiReviewFiles(config.projectPath, ai.maxFiles ?? DEFAULT_MAX_FILES);
  if (files.length === 0) {
    return heuristicFallback(config, "no bounded README, package, route, OpenAPI, or schema files were found");
  }

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ai.model,
        input: createPrompt(files),
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      return heuristicFallback(config, `OpenAI API returned status ${response.status}`);
    }

    const text = extractResponseText(await response.json());
    const risks = text ? parseAiRisks(text) : undefined;
    if (!risks) {
      return heuristicFallback(config, "OpenAI API response could not be converted into structured findings");
    }

    return [
      item(
        "llm-execution",
        "pass",
        "info",
        `LLM contextual risk review executed with ${files.length} bounded project file${files.length === 1 ? "" : "s"}.`,
        "Review AI findings alongside deterministic scanner results; validate recommendations before acting.",
        files.map((file) => file.path),
      ),
      ...aiRiskItems(risks),
    ];
  } catch (error) {
    return heuristicFallback(config, `OpenAI API call failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

async function scanAi(config: AuditConfig): Promise<ReportItem[]> {
  if (!config.ai?.enabled) {
    return [
      item(
        "ai-risk-review",
        "skipped",
        "info",
        "Optional AI Risk Review is disabled.",
        "Enable ai.enabled only when contextual LLM review or the deterministic fallback is desired.",
      ),
    ];
  }

  const apiKeyEnvironmentVariable = config.ai.apiKeyEnv ?? DEFAULT_API_KEY_ENV;
  const apiKey = process.env[apiKeyEnvironmentVariable];
  if (!apiKey) {
    return heuristicFallback(config, `${apiKeyEnvironmentVariable} is not configured`);
  }

  return runOpenAiReview(config, apiKey);
}

export const aiScanner: Scanner = {
  name: "ai-risk-review",
  async scan(config) {
    try {
      return await scanAi(config);
    } catch (error) {
      return [
        item(
          "ai-risk-review",
          "skipped",
          "low",
          `AI Risk Review could not complete: ${error instanceof Error ? error.message : "unknown error"}`,
          "Review AI configuration or rely on deterministic scanner results. AI failures do not block the audit.",
        ),
      ];
    }
  },
};
