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
      // ~600-file repo) but production was observed hitting exactly that
      // ceiling. Not CPU-credit throttling — the instance runs in unlimited
      // credit mode, so it never throttles. Most likely CPU contention: the
      // worker runs 3 audits at once, each starting Semgrep, Bandit and
      // Gitleaks in parallel, on a 2-vCPU / 1.9 GB box. Even run alone there,
      // Semgrep takes ~73s on mitmproxy. Widened for headroom; the real fix
      // is lower worker concurrency or a bigger instance.
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
