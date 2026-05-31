export interface HttpProbeResult {
  reachable: boolean;
  status?: number;
  error?: string;
}

export async function probeUrl(url: string, timeoutMs = 3_000): Promise<HttpProbeResult> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return { reachable: true, status: response.status };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : "Unknown HTTP probe error",
    };
  }
}

export interface TimedHttpResponse {
  response?: Response;
  durationMs: number;
  error?: string;
}

export async function fetchWithTiming(url: string, timeoutMs = 3_000): Promise<TimedHttpResponse> {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(timeoutMs) });
    return { response, durationMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : "Unknown HTTP request error",
    };
  }
}
