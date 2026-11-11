import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { execFileCustomMock, fsMock } = vi.hoisted(() => ({
  execFileCustomMock: vi.fn(),
  fsMock: { mkdir: vi.fn(), rm: vi.fn(), readdir: vi.fn() },
}));

vi.mock('child_process', async () => {
  const { promisify } = await import('node:util');
  const execFile: any = () => { throw new Error('only the promisified form is mocked'); };
  execFile[promisify.custom] = execFileCustomMock;
  return { execFile };
});
vi.mock('fs/promises', () => ({ default: fsMock }));

import { cloneRepo, clearReposDir } from './gitClone';

const fetchMock = vi.fn();

function githubSize(kb: number) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ size: kb }), { status: 200 }));
}

beforeEach(() => {
  execFileCustomMock.mockReset().mockResolvedValue({ stdout: '', stderr: '' });
  for (const fn of Object.values(fsMock)) fn.mockReset().mockResolvedValue(undefined);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cloneRepo', () => {
  it('shallow-clones into a fresh per-audit directory', async () => {
    githubSize(50 * 1024);

    const dest = await cloneRepo('audit-1', 'https://github.com/acme/app');

    expect(dest).toBe('/tmp/devaudit-repos/audit-1');
    // Any leftover from a crashed earlier attempt is removed before cloning.
    expect(fsMock.rm).toHaveBeenCalledWith('/tmp/devaudit-repos/audit-1', expect.objectContaining({ recursive: true }));
    expect(execFileCustomMock).toHaveBeenCalledWith(
      'git', ['clone', '--depth', '1', 'https://github.com/acme/app', '/tmp/devaudit-repos/audit-1'], expect.anything()
    );
  });

  it('rejects a malformed URL before touching the network or disk', async () => {
    await expect(cloneRepo('a', 'https://github.com/acme/app; rm -rf /')).rejects.toThrow(/Invalid repo URL/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fsMock.mkdir).not.toHaveBeenCalled();
  });

  it('refuses a repository over the size limit without cloning it', async () => {
    githubSize(1700 * 1024); // ~1.7 GB, e.g. microsoft/vscode

    await expect(cloneRepo('a', 'https://github.com/microsoft/vscode')).rejects.toThrow(/too large to audit \(1700 MB; the limit is 1024 MB\)/);
    expect(execFileCustomMock).not.toHaveBeenCalled();
  });

  it('reports a missing or private repository clearly', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));

    await expect(cloneRepo('a', 'https://github.com/acme/private')).rejects.toThrow(/not found or not public/);
    expect(execFileCustomMock).not.toHaveBeenCalled();
  });

  it('still clones when GitHub is unreachable or rate-limits the size check', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    await cloneRepo('a', 'https://github.com/acme/app');

    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 403 }));
    await cloneRepo('b', 'https://github.com/acme/app');

    expect(execFileCustomMock).toHaveBeenCalledTimes(2);
  });

  it('accepts a .git suffix and checks the size of the right repo', async () => {
    githubSize(10);
    await cloneRepo('a', 'https://github.com/acme/app.git');
    expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/acme/app', expect.anything());
  });
});

describe('clearReposDir', () => {
  it('removes every leftover clone', async () => {
    fsMock.readdir.mockResolvedValue(['old-1', 'old-2']);

    expect(await clearReposDir()).toBe(2);
    expect(fsMock.rm).toHaveBeenCalledWith('/tmp/devaudit-repos/old-1', expect.anything());
    expect(fsMock.rm).toHaveBeenCalledWith('/tmp/devaudit-repos/old-2', expect.anything());
  });

  it('is a no-op when the directory does not exist yet', async () => {
    fsMock.readdir.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    expect(await clearReposDir()).toBe(0);
  });
});
