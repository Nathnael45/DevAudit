import { execFile } from 'child_process';
import { promisify } from 'util';

import { ScanResult, describeScanError } from './scanResult';

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 120_000;

export interface BanditFinding {
  filename: string;
  line_number: number;
  line_range: number[];
  issue_text: string;
  issue_severity: string;
  issue_confidence: string;
  test_id: string;
  test_name: string;
  code: string;
}

export async function runBandit(repoPath: string): Promise<ScanResult<BanditFinding>> {
  try {
    const { stdout } = await execFileAsync(
      'bandit',
      ['-r', repoPath, '-f', 'json', '-q'],
      { timeout: TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout);
    return { findings: parsed.results ?? [] };
  } catch (err: any) {
    // bandit exits 1 when issues found; stdout still has JSON.
    // A timeout kills it mid-run, so any output then is partial — not trusted.
    if (err.stdout && !err.killed) {
      try {
        const parsed = JSON.parse(err.stdout);
        return { findings: parsed.results ?? [] };
      } catch { /* fall through */ }
    }
    console.warn('[bandit] failed:', err.message);
    return { findings: [], error: describeScanError(err, TIMEOUT_MS) };
  }
}
