import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { ScanResult, describeScanError } from './scanResult';

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 60_000;

export interface GitleaksFinding {
  Description: string;
  StartLine: number;
  EndLine: number;
  File: string;
  Secret: string;
  Match: string;
  RuleID: string;
}

export async function runGitleaks(repoPath: string): Promise<ScanResult<GitleaksFinding>> {
  const reportPath = path.join(os.tmpdir(), `gitleaks-${Date.now()}.json`);
  try {
    await execFileAsync(
      'gitleaks',
      ['detect', '--source', repoPath, '--report-format', 'json', '--report-path', reportPath, '--no-git', '--exit-code', '0'],
      { timeout: TIMEOUT_MS }
    );
    const raw = await fs.readFile(reportPath, 'utf-8');
    return { findings: raw.trim() ? JSON.parse(raw) ?? [] : [] };
  } catch (err: any) {
    // gitleaks exits 1 when leaks found — report file still written.
    // A timeout kills it before the report is complete, so don't read it then.
    if (!err.killed) {
      try {
        const raw = await fs.readFile(reportPath, 'utf-8');
        return { findings: raw.trim() ? JSON.parse(raw) ?? [] : [] };
      } catch { /* no report file */ }
    }
    console.warn('[gitleaks] failed:', err.message);
    return { findings: [], error: describeScanError(err, TIMEOUT_MS) };
  } finally {
    await fs.rm(reportPath, { force: true });
  }
}
