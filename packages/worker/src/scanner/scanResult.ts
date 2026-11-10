// What every scanner returns. `error` is set when the tool didn't finish
// (timeout, crash, missing binary) — without it, a scanner that never ran is
// indistinguishable from one that ran and found nothing, and a security
// report would present "0 issues" for code that was never checked.
export interface ScanResult<T> {
  findings: T[];
  error?: string;
}

// execFile kills the child and sets `killed` when its `timeout` elapses.
export function describeScanError(err: any, timeoutMs: number): string {
  if (err?.killed) return `timed out after ${Math.round(timeoutMs / 1000)}s`;
  return `failed to run (${String(err?.message ?? err).split('\n')[0]})`;
}
