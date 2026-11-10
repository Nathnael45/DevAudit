import { Pool } from 'pg';

export const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Cancelling an audit (POST /api/audits/:id/cancel) only flips its row to
// 'failed' — nothing signals the worker directly. So every status write here
// is a compare-and-set against the state the worker expects, never a blind
// overwrite, which is what stops a cancelled audit from being resurrected as
// 'running' or 'done' by a worker that didn't know about the cancel.

// queued -> running. False means the audit was cancelled (or deleted) while it
// sat in the queue, and the job should be skipped. 'running' is accepted too:
// if a worker dies mid-audit, BullMQ re-queues the stalled job once its lock
// expires, and that retry must still be able to run (or fail) rather than be
// skipped and leave the audit stuck at 'running' forever.
export async function claimAuditForRun(auditId: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE audits SET status = 'running' WHERE id = $1 AND status IN ('queued', 'running') RETURNING id`,
    [auditId]
  );
  return result.rowCount === 1;
}

// running -> done | failed. False means it was cancelled mid-run, so the
// cancel's status stands.
export async function finishAudit(auditId: string, status: 'done' | 'failed'): Promise<boolean> {
  const result = await db.query(
    `UPDATE audits SET status = $1, completed_at = NOW() WHERE id = $2 AND status = 'running' RETURNING id`,
    [status, auditId]
  );
  return result.rowCount === 1;
}

export async function isAuditStillRunning(auditId: string): Promise<boolean> {
  const result = await db.query('SELECT status FROM audits WHERE id = $1', [auditId]);
  return result.rows[0]?.status === 'running';
}

export async function updateAuditTimings(auditId: string, timings: object) {
  await db.query('UPDATE audits SET timings = $1 WHERE id = $2', [JSON.stringify(timings), auditId]);
}

export async function saveEvent(
  auditId: string,
  type: 'thought' | 'finding' | 'summary' | 'error',
  content: string,
  metadata?: object
) {
  await db.query(
    'INSERT INTO audit_events (audit_id, type, content, metadata) VALUES ($1, $2, $3, $4)',
    [auditId, type, content, metadata ? JSON.stringify(metadata) : null]
  );
}

export async function saveFinding(auditId: string, finding: {
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  severity: string;
  category: string;
  title: string;
  description: string;
  recommendation: string;
  rawOutput?: object;
}) {
  await db.query(
    `INSERT INTO findings
      (audit_id, file_path, line_start, line_end, severity, category, title, description, recommendation, raw_output)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      auditId,
      finding.filePath ?? null,
      finding.lineStart ?? null,
      finding.lineEnd ?? null,
      finding.severity,
      finding.category,
      finding.title,
      finding.description,
      finding.recommendation,
      finding.rawOutput ? JSON.stringify(finding.rawOutput) : null,
    ]
  );
}
