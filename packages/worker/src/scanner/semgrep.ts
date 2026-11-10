import { execFile } from 'child_process';
import { promisify } from 'util';

import { ScanResult, describeScanError } from './scanResult';

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 300_000;

export interface SemgrepFinding {
  path: string;
  start: { line: number };
  end: { line: number };
  extra: {
    message: string;
    severity: string;
    metadata?: { category?: string; cwe?: string[] };
  };
  check_id: string;
}

export async function runSemgrep(repoPath: string): Promise<ScanResult<SemgrepFinding>> {
  try {
    const { stdout } = await execFileAsync(
      'semgrep',
      ['--config', 'auto', '--json', '--quiet', repoPath],
      // 120s measured fine in isolation (~35-40s against mitmproxy, a real
      // ~600-file repo) but production was observed hitting exactly this
      // ceiling and silently returning 0 results — most likely burstable
      // (t3) CPU credit throttling under sustained load, which local
      // resource-constrained testing can't reproduce (that's a full
      // sustained allocation, not AWS's credit-based bursting). Widened for
      // real headroom rather than guessing at the exact throttled rate.
      { timeout: TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout);
    return { findings: parsed.results ?? [] };
  } catch (err: any) {
    // semgrep exits non-zero when findings exist; stdout still has JSON.
    // A timeout kills it mid-run, so any output then is partial — not trusted.
    if (err.stdout && !err.killed) {
      try {
        const parsed = JSON.parse(err.stdout);
        return { findings: parsed.results ?? [] };
      } catch { /* fall through */ }
    }
    console.warn('[semgrep] failed:', err.message);
    return { findings: [], error: describeScanError(err, TIMEOUT_MS) };
  }
}
