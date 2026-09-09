import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execFileAsync = promisify(execFile);

const REPOS_DIR = process.env.REPOS_DIR || '/tmp/devaudit-repos';

export async function cloneRepo(auditId: string, repoUrl: string): Promise<string> {
  const dest = path.join(REPOS_DIR, auditId);
  await fs.mkdir(dest, { recursive: true });

  // Sanitize: only allow https github URLs
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/.test(repoUrl)) {
    throw new Error(`Invalid repo URL: ${repoUrl}`);
  }

  await execFileAsync('git', ['clone', '--depth', '1', repoUrl, dest], {
    timeout: 60_000,
  });

  return dest;
}

export async function cleanupRepo(auditId: string) {
  const dest = path.join(REPOS_DIR, auditId);
  // A killed scanner process (e.g. Semgrep hitting its timeout) can still be
  // flushing writes into this tree for a brief moment after we decide to clean
  // up, which races fs.rm's recursive walk and throws a spurious ENOTEMPTY —
  // a known Node quirk, hence the built-in retry knobs rather than a custom loop.
  await fs.rm(dest, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
