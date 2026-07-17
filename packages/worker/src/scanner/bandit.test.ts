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

    expect(await runBandit('/repo')).toEqual([{ test_id: 'B105' }]);
  });

  it('still parses findings when bandit exits non-zero (its normal behavior when issues are found)', async () => {
    const err: any = new Error('Command failed');
    err.stdout = JSON.stringify({ results: [{ test_id: 'B608' }] });
    execFileCustomMock.mockRejectedValue(err);

    expect(await runBandit('/repo')).toEqual([{ test_id: 'B608' }]);
  });

  it('returns [] when the failure has no usable stdout', async () => {
    execFileCustomMock.mockRejectedValue(new Error('bandit: command not found'));

    expect(await runBandit('/repo')).toEqual([]);
  });

  it('returns [] when stdout on failure is not valid JSON', async () => {
    const err: any = new Error('Command failed');
    err.stdout = 'not json';
    execFileCustomMock.mockRejectedValue(err);

    expect(await runBandit('/repo')).toEqual([]);
  });
});
