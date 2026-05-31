import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AuditConfig } from "../types/config.js";

const DEFAULT_CONFIG_PATH = "qa-audit.config.json";

function substituteEnvironmentVariables(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name: string) => process.env[name] ?? "");
  }

  if (Array.isArray(value)) {
    return value.map(substituteEnvironmentVariables);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, substituteEnvironmentVariables(nestedValue)]),
    );
  }

  return value;
}

function validateConfig(value: unknown): AuditConfig {
  if (!value || typeof value !== "object") {
    throw new Error("Config must be a JSON object.");
  }

  const config = value as Partial<AuditConfig>;
  if (typeof config.projectPath !== "string" || config.projectPath.length === 0) {
    throw new Error("Config field 'projectPath' is required.");
  }
  if (typeof config.outputDir !== "string" || config.outputDir.length === 0) {
    throw new Error("Config field 'outputDir' is required.");
  }

  return config as AuditConfig;
}

export async function loadConfig(configPath = DEFAULT_CONFIG_PATH): Promise<AuditConfig> {
  const absoluteConfigPath = path.resolve(configPath);
  const configDirectory = path.dirname(absoluteConfigPath);
  const contents = await readFile(absoluteConfigPath, "utf8");
  const parsed = substituteEnvironmentVariables(JSON.parse(contents));
  const config = validateConfig(parsed);

  return {
    ...config,
    projectPath: path.resolve(configDirectory, config.projectPath),
    outputDir: path.resolve(configDirectory, config.outputDir),
  };
}
