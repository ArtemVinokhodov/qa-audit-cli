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

export interface UiPageConfig {
  name?: string;
  path: string;
}

export interface UiBreakpointConfig {
  name?: string;
  width: number;
  height: number;
}

export interface UiConfig {
  baseUrl?: string;
  pages?: UiPageConfig[];
  breakpoints?: UiBreakpointConfig[];
  failOnConsoleErrors?: boolean;
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
