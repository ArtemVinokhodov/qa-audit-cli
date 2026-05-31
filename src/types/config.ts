export interface ApiEndpointConfig {
  name?: string;
  path: string;
  expectedStatus?: number;
  expectedContentType?: string;
}

export interface ApiConfig {
  baseUrl?: string;
  healthEndpoint?: ApiEndpointConfig;
  endpoints?: ApiEndpointConfig[];
  latencyWarnMs?: number;
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
