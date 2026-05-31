export interface ApiConfig {
  baseUrl?: string;
  healthPath?: string;
}

export interface UiConfig {
  baseUrl?: string;
  pages?: string[];
}

export interface AiConfig {
  enabled?: boolean;
  provider?: string;
  model?: string;
  apiKeyEnv?: string;
}

export interface AuditConfig {
  projectPath: string;
  outputDir: string;
  api?: ApiConfig;
  ui?: UiConfig;
  ai?: AiConfig;
}
