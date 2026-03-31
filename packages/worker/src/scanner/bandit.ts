import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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

export async function runBandit(repoPath: string): Promise<BanditFinding[]> {
  try {
    const { stdout } = await execFileAsync(
      'bandit',
      ['-r', repoPath, '-f', 'json', '-q'],
      { timeout: 120_000, maxBuffer: 50 * 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout);
    return parsed.results ?? [];
  } catch (err: any) {
    // bandit exits 1 when issues found; stdout still has JSON
    if (err.stdout) {
      try {
        const parsed = JSON.parse(err.stdout);
        return parsed.results ?? [];
      } catch { /* fall through */ }
    }
    console.warn('[bandit] failed:', err.message);
    return [];
  }
}
