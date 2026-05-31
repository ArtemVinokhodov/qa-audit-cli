import path from "node:path";
import type { AuditConfig } from "../types/config.js";
import type { ReportItem, ReportSeverity, ReportStatus, Scanner } from "../types/report.js";
import {
  findFilesByExtension,
  isDirectory,
  pathExists,
  readTextFileIfExists,
} from "../utils/filesystem.js";

const LOCK_FILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"];
const PYTHON_MANIFESTS = ["requirements.txt", "pyproject.toml", "Pipfile"];
const JAVA_MANIFESTS = ["pom.xml", "build.gradle"];
const LINT_CONFIGS = [
  "eslint.config.js",
  "eslint.config.cjs",
  "eslint.config.mjs",
  "eslint.config.ts",
  ".eslintrc",
  ".eslintrc.json",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.yml",
  ".eslintrc.yaml",
  "biome.json",
  "biome.jsonc",
  ".biome.json",
];

interface StackDetection {
  stacks: string[];
  evidence: string[];
  isNode: boolean;
  isTypeScript: boolean;
}

function item(
  checkName: string,
  status: ReportStatus,
  severity: ReportSeverity,
  finding: string,
  recommendation: string,
  evidence?: string[],
): ReportItem {
  return {
    scanner: "repository",
    category: "repository",
    checkName,
    status,
    severity,
    finding,
    recommendation,
    ...(evidence && evidence.length > 0 ? { evidence } : {}),
  };
}

async function existingFiles(projectPath: string, candidates: string[]): Promise<string[]> {
  const results = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      exists: await pathExists(path.join(projectPath, candidate)),
    })),
  );

  return results.filter(({ exists }) => exists).map(({ candidate }) => candidate);
}

function hasPackageDependency(packageJson: string | undefined, dependencyName: string): boolean {
  if (!packageJson) {
    return false;
  }

  try {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(parsed.dependencies?.[dependencyName] || parsed.devDependencies?.[dependencyName]);
  } catch {
    return false;
  }
}

async function detectStacks(projectPath: string): Promise<StackDetection> {
  const [nodeFiles, pythonFiles, javaFiles, goFiles, packageJson, typeScriptFiles] = await Promise.all([
    existingFiles(projectPath, ["package.json", "tsconfig.json"]),
    existingFiles(projectPath, PYTHON_MANIFESTS),
    existingFiles(projectPath, JAVA_MANIFESTS),
    existingFiles(projectPath, ["go.mod"]),
    readTextFileIfExists(path.join(projectPath, "package.json")),
    findFilesByExtension(projectPath, [".ts", ".tsx"]),
  ]);

  const isNode = nodeFiles.length > 0;
  const isTypeScript =
    nodeFiles.includes("tsconfig.json") ||
    hasPackageDependency(packageJson, "typescript") ||
    typeScriptFiles.length > 0;
  const stacks: string[] = [];
  const evidence = [...nodeFiles, ...pythonFiles, ...javaFiles, ...goFiles];

  if (isNode) {
    stacks.push(isTypeScript ? "Node/TypeScript" : "Node");
  }
  if (pythonFiles.length > 0) {
    stacks.push("Python");
  }
  if (javaFiles.length > 0) {
    stacks.push("Java");
  }
  if (goFiles.length > 0) {
    stacks.push("Go");
  }

  return {
    stacks: stacks.length > 0 ? stacks : ["Unknown"],
    evidence,
    isNode,
    isTypeScript,
  };
}

function normalizeIgnorePattern(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
    return undefined;
  }

  return trimmed.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/|\/$/g, "");
}

function hasIgnorePattern(patterns: string[], expected: string): boolean {
  return patterns.some((pattern) => pattern === expected || pattern.endsWith(`/${expected}`));
}

async function scanGitignore(projectPath: string, isNode: boolean): Promise<ReportItem[]> {
  const gitignorePath = path.join(projectPath, ".gitignore");
  const contents = await readTextFileIfExists(gitignorePath);
  if (contents === undefined) {
    return [
      item(
        "gitignore-presence",
        "warn",
        "medium",
        "Repository does not contain a .gitignore file.",
        "Add a .gitignore file and exclude dependencies, local environment files, generated reports, and build output.",
      ),
    ];
  }

  const patterns = contents
    .split(/\r?\n/)
    .map(normalizeIgnorePattern)
    .filter((pattern): pattern is string => Boolean(pattern));
  const missingPatterns: string[] = [];

  if (isNode && !hasIgnorePattern(patterns, "node_modules")) {
    missingPatterns.push("node_modules");
  }
  if (!hasIgnorePattern(patterns, ".env")) {
    missingPatterns.push(".env");
  }
  if (!hasIgnorePattern(patterns, "reports")) {
    missingPatterns.push("reports");
  }
  if (isNode && !hasIgnorePattern(patterns, "dist") && !hasIgnorePattern(patterns, "build")) {
    missingPatterns.push("dist or build");
  }

  if (missingPatterns.length > 0) {
    return [
      item(
        "gitignore-rules",
        "warn",
        "medium",
        `.gitignore is present but does not cover expected patterns: ${missingPatterns.join(", ")}.`,
        "Add ignore rules for local dependencies, environment files, generated reports, and build output as applicable.",
        [".gitignore"],
      ),
    ];
  }

  return [
    item(
      "gitignore-rules",
      "pass",
      "info",
      ".gitignore covers expected local dependencies, environment files, reports, and build output.",
      "Keep ignore rules aligned with generated project artifacts.",
      [".gitignore"],
    ),
  ];
}

async function scanRepository(config: AuditConfig): Promise<ReportItem[]> {
  const projectPath = config.projectPath;
  if (!(await isDirectory(projectPath))) {
    return [
      item(
        "project-path",
        "fail",
        "high",
        `Configured project path is not an accessible directory: ${projectPath}`,
        "Update projectPath in the audit config to point to an existing local project directory.",
        [projectPath],
      ),
    ];
  }

  const findings: ReportItem[] = [];
  const stack = await detectStacks(projectPath);
  findings.push(
    item(
      "stack-detection",
      stack.stacks.includes("Unknown") ? "warn" : "pass",
      stack.stacks.includes("Unknown") ? "low" : "info",
      `Detected project stack: ${stack.stacks.join(", ")}.`,
      stack.stacks.includes("Unknown")
        ? "Document the target stack or add a supported manifest so stack-specific checks can run."
        : "Review stack-specific findings and keep repository manifests up to date.",
      stack.evidence,
    ),
  );

  const packageJsonExists = await pathExists(path.join(projectPath, "package.json"));
  if (stack.isNode) {
    findings.push(
      item(
        "node-package-manifest",
        packageJsonExists ? "pass" : "warn",
        packageJsonExists ? "info" : "medium",
        packageJsonExists
          ? "Node package manifest package.json is present."
          : "Node/TypeScript indicators were found, but package.json is missing.",
        packageJsonExists
          ? "Keep package.json dependency and script metadata current."
          : "Add package.json so Node dependencies and scripts are reproducible.",
        packageJsonExists ? ["package.json"] : undefined,
      ),
    );

    const lockFiles = await existingFiles(projectPath, LOCK_FILES);
    findings.push(
      packageJsonExists
        ? item(
            "node-lock-file",
            lockFiles.length > 0 ? "pass" : "warn",
            lockFiles.length > 0 ? "info" : "medium",
            lockFiles.length > 0
              ? `Node dependency lock file is present: ${lockFiles.join(", ")}.`
              : "Node project has package.json but no supported dependency lock file.",
            lockFiles.length > 0
              ? "Commit one lock file and keep it synchronized with package.json."
              : "Generate and commit package-lock.json, pnpm-lock.yaml, or yarn.lock for reproducible installs.",
            lockFiles,
          )
        : item(
            "node-lock-file",
            "skipped",
            "info",
            "Node dependency lock file check skipped because package.json is missing.",
            "Add package.json before selecting and committing a Node dependency lock file.",
          ),
    );
  } else {
    findings.push(
      item(
        "node-package-manifest",
        "skipped",
        "info",
        "Node package manifest check skipped because the target was not detected as Node.",
        "No action is required unless this repository is expected to use Node.",
      ),
    );
  }

  if (stack.isTypeScript) {
    const tsconfigExists = await pathExists(path.join(projectPath, "tsconfig.json"));
    findings.push(
      item(
        "typescript-config",
        tsconfigExists ? "pass" : "warn",
        tsconfigExists ? "info" : "medium",
        tsconfigExists
          ? "TypeScript configuration tsconfig.json is present."
          : "TypeScript usage was detected, but tsconfig.json is missing.",
        tsconfigExists
          ? "Keep compiler options aligned with the supported runtime."
          : "Add tsconfig.json to make TypeScript compilation settings explicit and reproducible.",
        tsconfigExists ? ["tsconfig.json"] : undefined,
      ),
    );
  } else {
    findings.push(
      item(
        "typescript-config",
        "skipped",
        "info",
        "TypeScript configuration check skipped because TypeScript usage was not detected.",
        "No action is required unless TypeScript sources are added.",
      ),
    );
  }

  findings.push(...(await scanGitignore(projectPath, stack.isNode)));

  const workflowsPath = path.join(projectPath, ".github", "workflows");
  const workflowsDirectoryExists = await isDirectory(workflowsPath);
  findings.push(
    item(
      "ci-config",
      workflowsDirectoryExists ? "pass" : "warn",
      workflowsDirectoryExists ? "info" : "low",
      workflowsDirectoryExists
        ? "GitHub Actions workflow directory is present."
        : "No .github/workflows CI configuration directory was found.",
      workflowsDirectoryExists
        ? "Keep CI workflows aligned with build and audit commands."
        : "Add CI configuration to run repeatable validation on changes.",
      workflowsDirectoryExists ? [".github/workflows"] : undefined,
    ),
  );

  const lintConfigs = await existingFiles(projectPath, LINT_CONFIGS);
  findings.push(
    item(
      "lint-config",
      lintConfigs.length > 0 ? "pass" : "warn",
      lintConfigs.length > 0 ? "info" : "low",
      lintConfigs.length > 0
        ? `Lint configuration is present: ${lintConfigs.join(", ")}.`
        : "No supported ESLint or Biome configuration was found.",
      lintConfigs.length > 0
        ? "Run lint checks in local development and CI."
        : "Add an ESLint, Biome, or equivalent lint configuration and run it in CI.",
      lintConfigs,
    ),
  );

  return findings;
}

export const repositoryScanner: Scanner = {
  name: "repository",
  async scan(config) {
    try {
      return await scanRepository(config);
    } catch (error) {
      return [
        item(
          "repository-scan",
          "fail",
          "high",
          `Repository scan could not complete: ${error instanceof Error ? error.message : "unknown error"}`,
          "Check filesystem permissions and target project configuration, then rerun the audit.",
        ),
      ];
    }
  },
};
