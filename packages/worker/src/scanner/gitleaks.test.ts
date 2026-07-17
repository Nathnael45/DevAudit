import { describe, it, expect, vi, beforeEach } from 'vitest';

const { execFileCustomMock, readFileMock, rmMock } = vi.hoisted(() => ({
  execFileCustomMock: vi.fn(),
  readFileMock: vi.fn(),
  rmMock: vi.fn(),
}));

vi.mock('child_process', async () => {
  const { promisify } = await import('node:util');
  const execFile: any = () => {
    throw new Error('execFile mock only supports the promisified call form');
  };
  execFile[promisify.custom] = execFileCustomMock;
  return { execFile };
});

vi.mock('fs/promises', () => ({
  default: { readFile: readFileMock, rm: rmMock },
}));

import { runGitleaks } from './gitleaks';

beforeEach(() => {
  execFileCustomMock.mockReset();
  readFileMock.mockReset();
  rmMock.mockReset().mockResolvedValue(undefined);
});

describe('runGitleaks', () => {
  // gitleaks is invoked with --exit-code 0, so it exits 0 even when it finds
  // leaks — the report file, not the exit code, is what carries the results.
  it('parses findings from the report file after a normal run', async () => {
    execFileCustomMock.mockResolvedValue({ stdout: '', stderr: '' });
    readFileMock.mockResolvedValue(JSON.stringify([{ RuleID: 'aws-access-key' }]));

    expect(await runGitleaks('/repo')).toEqual([{ RuleID: 'aws-access-key' }]);
  });

  it('returns [] when the report file is empty (no leaks found)', async () => {
    execFileCustomMock.mockResolvedValue({ stdout: '', stderr: '' });
    readFileMock.mockResolvedValue('');

    expect(await runGitleaks('/repo')).toEqual([]);
  });

  it('still reads the report file if gitleaks itself fails unexpectedly', async () => {
    execFileCustomMock.mockRejectedValue(new Error('unexpected failure'));
    readFileMock.mockResolvedValue(JSON.stringify([{ RuleID: 'generic-secret' }]));

    expect(await runGitleaks('/repo')).toEqual([{ RuleID: 'generic-secret' }]);
  });

  it('returns [] when there is no report file to read at all', async () => {
    execFileCustomMock.mockRejectedValue(new Error('gitleaks: command not found'));
    readFileMock.mockRejectedValue(new Error('ENOENT'));

    expect(await runGitleaks('/repo')).toEqual([]);
  });

  it('always cleans up the report file, even on failure', async () => {
    execFileCustomMock.mockRejectedValue(new Error('boom'));
    readFileMock.mockRejectedValue(new Error('ENOENT'));

    await runGitleaks('/repo');

    expect(rmMock).toHaveBeenCalledWith(expect.stringContaining('gitleaks-'), { force: true });
  });
});
