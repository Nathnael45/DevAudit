import { describe, it, expect, vi, beforeEach } from 'vitest';

const { execFileCustomMock } = vi.hoisted(() => ({ execFileCustomMock: vi.fn() }));

vi.mock('child_process', async () => {
  const { promisify } = await import('node:util');
  const execFile: any = () => {
    throw new Error('execFile mock only supports the promisified call form');
  };
  execFile[promisify.custom] = execFileCustomMock;
  return { execFile };
});

import { runBandit } from './bandit';

beforeEach(() => {
  execFileCustomMock.mockReset();
});

describe('runBandit', () => {
  it('parses findings on a clean run', async () => {
    execFileCustomMock.mockResolvedValue({
      stdout: JSON.stringify({ results: [{ test_id: 'B105' }] }),
      stderr: '',
    });

    expect(await runBandit('/repo')).toEqual({ findings: [{ test_id: 'B105' }] });
  });

  it('still parses findings when bandit exits non-zero (its normal behavior when issues are found)', async () => {
    const err: any = new Error('Command failed');
    err.stdout = JSON.stringify({ results: [{ test_id: 'B608' }] });
    execFileCustomMock.mockRejectedValue(err);

    expect(await runBandit('/repo')).toEqual({ findings: [{ test_id: 'B608' }] });
  });

  it('reports an error (not a clean empty result) when the failure has no usable stdout', async () => {
    execFileCustomMock.mockRejectedValue(new Error('bandit: command not found'));

    expect(await runBandit('/repo')).toEqual({ findings: [], error: 'failed to run (bandit: command not found)' });
  });

  it('reports an error when stdout on failure is not valid JSON', async () => {
    const err: any = new Error('Command failed');
    err.stdout = 'not json';
    execFileCustomMock.mockRejectedValue(err);

    expect(await runBandit('/repo')).toEqual({ findings: [], error: 'failed to run (Command failed)' });
  });

  it('reports a timeout instead of passing off partial output as a clean scan', async () => {
    const err: any = new Error('Command failed');
    err.killed = true;
    err.stdout = JSON.stringify({ results: [{ test_id: 'partial' }] });
    execFileCustomMock.mockRejectedValue(err);

    expect(await runBandit('/repo')).toEqual({ findings: [], error: 'timed out after 120s' });
  });
});
