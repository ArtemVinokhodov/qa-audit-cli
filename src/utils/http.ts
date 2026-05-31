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
