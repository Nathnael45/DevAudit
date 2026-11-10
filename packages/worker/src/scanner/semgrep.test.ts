import { describe, it, expect, vi, beforeEach } from 'vitest';

const { execFileCustomMock } = vi.hoisted(() => ({ execFileCustomMock: vi.fn() }));

// execFileAsync is `promisify(execFile)` — Node's real execFile has a built-in
// [promisify.custom] that resolves to { stdout, stderr } instead of the default
// single-value promisify behavior, so the mock has to replicate that hook rather
// than just being a plain vi.fn() standing in for execFile itself.
vi.mock('child_process', async () => {
  const { promisify } = await import('node:util');
  const execFile: any = () => {
    throw new Error('execFile mock only supports the promisified call form');
  };
  execFile[promisify.custom] = execFileCustomMock;
  return { execFile };
});

import { runSemgrep } from './semgrep';

beforeEach(() => {
  execFileCustomMock.mockReset();
});

describe('runSemgrep', () => {
  it('parses findings on a clean run', async () => {
    execFileCustomMock.mockResolvedValue({
      stdout: JSON.stringify({ results: [{ check_id: 'sql-injection' }] }),
      stderr: '',
    });

    expect(await runSemgrep('/repo')).toEqual({ findings: [{ check_id: 'sql-injection' }] });
  });

  it('still parses findings when semgrep exits non-zero (its normal behavior when findings exist)', async () => {
    const err: any = new Error('Command failed');
    err.stdout = JSON.stringify({ results: [{ check_id: 'xss' }] });
    execFileCustomMock.mockRejectedValue(err);

    expect(await runSemgrep('/repo')).toEqual({ findings: [{ check_id: 'xss' }] });
  });

  it('reports an error (not a clean empty result) when the failure has no usable stdout', async () => {
    execFileCustomMock.mockRejectedValue(new Error('semgrep: command not found'));

    expect(await runSemgrep('/repo')).toEqual({ findings: [], error: 'failed to run (semgrep: command not found)' });
  });

  it('reports an error when stdout on failure is not valid JSON', async () => {
    const err: any = new Error('Command failed');
    err.stdout = 'not json';
    execFileCustomMock.mockRejectedValue(err);

    expect(await runSemgrep('/repo')).toEqual({ findings: [], error: 'failed to run (Command failed)' });
  });

  it('returns no findings (and no error) when results key is absent from otherwise-valid JSON', async () => {
    execFileCustomMock.mockResolvedValue({ stdout: JSON.stringify({}), stderr: '' });

    expect(await runSemgrep('/repo')).toEqual({ findings: [] });
  });

  it('reports a timeout instead of passing off partial output as a clean scan', async () => {
    const err: any = new Error('Command failed');
    err.killed = true;
    err.signal = 'SIGTERM';
    err.stdout = JSON.stringify({ results: [{ check_id: 'partial' }] });
    execFileCustomMock.mockRejectedValue(err);

    expect(await runSemgrep('/repo')).toEqual({ findings: [], error: 'timed out after 300s' });
  });
});
