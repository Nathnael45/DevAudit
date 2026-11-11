import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execFileAsync = promisify(execFile);

const REPOS_DIR = process.env.REPOS_DIR || '/tmp/devaudit-repos';

// GitHub reports repo size including full history, so a shallow clone is
// usually much smaller. 1 GB admits large real frameworks (angular/angular is
// ~660 MB) while refusing giants (microsoft/vscode ~1.7 GB, linux ~6 GB) that
// could fill the disk with several audits running at once.
const MAX_REPO_SIZE_MB = Number(process.env.MAX_REPO_SIZE_MB) || 1024;

const GITHUB_REPO_URL = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/;

// Checks the repo's size with the GitHub API before downloading anything.
// Fails open (logs and lets the clone proceed) if GitHub can't be reached or
// rate-limits us: the clone timeout still bounds the download, and a GitHub
// hiccup shouldn't block every audit.
export async function checkRepoSize(owner: string, repo: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { 'User-Agent': 'DevAudit', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err: any) {
    console.warn(`[clone] size check skipped (GitHub unreachable): ${err.message}`);
    return;
  }

  if (res.status === 404) throw new Error('Repository not found or not public.');
  if (!res.ok) {
    console.warn(`[clone] size check skipped (GitHub API returned ${res.status})`);
    return;
  }

  const sizeMb = Math.round(((await res.json()) as { size?: number }).size ?? 0) / 1024;
  if (sizeMb > MAX_REPO_SIZE_MB) {
    throw new Error(
      `Repository is too large to audit (${Math.round(sizeMb)} MB; the limit is ${MAX_REPO_SIZE_MB} MB).`
    );
  }
}

export async function cloneRepo(auditId: string, repoUrl: string): Promise<string> {
  // Validate before touching the disk or the network.
  const match = repoUrl.match(GITHUB_REPO_URL);
  if (!match) throw new Error(`Invalid repo URL: ${repoUrl}`);

  await checkRepoSize(match[1], match[2]);

  const dest = path.join(REPOS_DIR, auditId);
  // A retried job (BullMQ re-runs a job whose worker crashed) can find the
  // previous attempt's clone here; git refuses to clone into a non-empty
  // directory, so start clean.
  await removeDir(dest);
  await fs.mkdir(dest, { recursive: true });

  await execFileAsync('git', ['clone', '--depth', '1', repoUrl, dest], {
    timeout: 60_000,
  });

  return dest;
}

export async function cleanupRepo(auditId: string) {
  await removeDir(path.join(REPOS_DIR, auditId));
}

// Clones are normally deleted when their audit ends, but a worker that crashes
// or is restarted mid-audit never gets there. Called once at worker startup,
// before any job is picked up: with one worker per repos volume (as in
// docker-compose.yml), nothing in the directory can belong to a live audit.
export async function clearReposDir(): Promise<number> {
  let entries: string[];
  try {
    entries = await fs.readdir(REPOS_DIR);
  } catch (err: any) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
  await Promise.all(entries.map(name => removeDir(path.join(REPOS_DIR, name))));
  return entries.length;
}

async function removeDir(dir: string) {
  // A killed scanner process (e.g. Semgrep hitting its timeout) can still be
  // flushing writes into this tree for a brief moment after we decide to clean
  // up, which races fs.rm's recursive walk and throws a spurious ENOTEMPTY —
  // a known Node quirk, hence the built-in retry knobs rather than a custom loop.
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
