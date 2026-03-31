import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

export interface GitleaksFinding {
  Description: string;
  StartLine: number;
  EndLine: number;
  File: string;
  Secret: string;
  Match: string;
  RuleID: string;
}

export async function runGitleaks(repoPath: string): Promise<GitleaksFinding[]> {
  const reportPath = path.join(os.tmpdir(), `gitleaks-${Date.now()}.json`);
  try {
    await execFileAsync(
      'gitleaks',
      ['detect', '--source', repoPath, '--report-format', 'json', '--report-path', reportPath, '--no-git', '--exit-code', '0'],
      { timeout: 60_000 }
    );
    const raw = await fs.readFile(reportPath, 'utf-8');
    return raw.trim() ? JSON.parse(raw) ?? [] : [];
  } catch (err: any) {
    // gitleaks exits 1 when leaks found — report file still written
    try {
      const raw = await fs.readFile(reportPath, 'utf-8');
      return raw.trim() ? JSON.parse(raw) ?? [] : [];
    } catch { /* no report file */ }
    console.warn('[gitleaks] failed:', err.message);
    return [];
  } finally {
    await fs.rm(reportPath, { force: true });
  }
}
