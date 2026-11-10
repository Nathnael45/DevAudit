import { describe, it, expect, beforeEach, vi } from 'vitest';

// runAudit's cancellation handling is what this file tests — the scanners,
// Claude, the broadcaster and the database are all mocked so each test can
// script exactly when the audit's row stops reading 'running'.
const streamEvents = vi.hoisted(() => ({ list: [] as any[], abort: vi.fn(), onEach: () => {} }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      stream: () => ({
        abort: streamEvents.abort,
        async *[Symbol.asyncIterator]() {
          for (const ev of streamEvents.list) { streamEvents.onEach(); yield ev; }
        },
      }),
    };
  },
}));
vi.mock('../scanner/gitClone', () => ({
  cloneRepo: vi.fn().mockResolvedValue('/tmp/fake-repo'),
  cleanupRepo: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../scanner/semgrep', () => ({ runSemgrep: vi.fn().mockResolvedValue([]) }));
vi.mock('../scanner/bandit', () => ({ runBandit: vi.fn().mockResolvedValue([]) }));
vi.mock('../scanner/gitleaks', () => ({ runGitleaks: vi.fn().mockResolvedValue([]) }));
vi.mock('../utils/broadcaster', () => ({ emit: vi.fn() }));
vi.mock('../utils/db', () => ({
  claimAuditForRun: vi.fn(),
  finishAudit: vi.fn(),
  isAuditStillRunning: vi.fn(),
  updateAuditTimings: vi.fn().mockResolvedValue(undefined),
  saveEvent: vi.fn().mockResolvedValue(undefined),
  saveFinding: vi.fn().mockResolvedValue(undefined),
}));

import { runAudit } from './runner';
import * as db from '../utils/db';
import { cloneRepo, cleanupRepo } from '../scanner/gitClone';
import { runSemgrep } from '../scanner/semgrep';

const AUDIT = { auditId: '00000000-0000-0000-0000-000000000001', repoUrl: 'https://github.com/octocat/Hello-World' };

function textDelta(text: string) {
  return { type: 'content_block_delta', delta: { type: 'text_delta', text } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.claimAuditForRun).mockResolvedValue(true);
  vi.mocked(db.finishAudit).mockResolvedValue(true);
  vi.mocked(db.isAuditStillRunning).mockResolvedValue(true);
  streamEvents.list = [textDelta('All clear. <findings>[]</findings>')];
  streamEvents.onEach = () => {};
});

describe('runAudit cancellation', () => {
  it('skips the job entirely when the audit was cancelled while still queued', async () => {
    vi.mocked(db.claimAuditForRun).mockResolvedValue(false);

    await runAudit(AUDIT);

    expect(cloneRepo).not.toHaveBeenCalled();
    expect(db.finishAudit).not.toHaveBeenCalled();
  });

  it('stops before scanning when cancelled during the clone', async () => {
    vi.mocked(db.isAuditStillRunning).mockResolvedValue(false);

    await expect(runAudit(AUDIT)).resolves.toBeUndefined();

    expect(runSemgrep).not.toHaveBeenCalled();
    expect(db.finishAudit).not.toHaveBeenCalled();
    expect(cleanupRepo).toHaveBeenCalledWith(AUDIT.auditId);
  });

  it('aborts the Claude stream when cancelled mid-analysis', async () => {
    let now = 1_000_000;
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    // Running through clone + scan checks, then cancelled by the time the
    // stream's periodic check fires.
    vi.mocked(db.isAuditStillRunning)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    streamEvents.list = [
      { type: 'message_start' },
      textDelta('Reviewing finding 1...'),
    ];
    // Each streamed event moves the clock past the check interval.
    streamEvents.onEach = () => { now += 10_000; };

    await runAudit(AUDIT);
    dateSpy.mockRestore();

    expect(streamEvents.abort).toHaveBeenCalled();
    expect(db.saveFinding).not.toHaveBeenCalled();
    expect(db.finishAudit).not.toHaveBeenCalled();
  });

  it('leaves a cancel in place instead of overwriting it with done', async () => {
    vi.mocked(db.finishAudit).mockResolvedValue(false);

    await runAudit(AUDIT);

    expect(db.finishAudit).toHaveBeenCalledWith(AUDIT.auditId, 'done');
    expect(db.saveEvent).not.toHaveBeenCalledWith(AUDIT.auditId, 'thought', expect.stringContaining('Audit complete'));
  });

  it('still completes normally when nobody cancels', async () => {
    await runAudit(AUDIT);

    expect(db.finishAudit).toHaveBeenCalledWith(AUDIT.auditId, 'done');
    expect(db.saveEvent).toHaveBeenCalledWith(AUDIT.auditId, 'thought', expect.stringContaining('Audit complete'));
  });
});
