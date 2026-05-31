export function logInfo(message: string): void {
  console.log(`[qa-audit] ${message}`);
}

export function logError(message: string): void {
  console.error(`[qa-audit] ${message}`);
}
