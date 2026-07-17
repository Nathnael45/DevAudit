import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { db } from '../db/client';
import { enqueueAudit } from '../queue/auditQueue';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth';

export const auditRouter = Router();

const AUDIT_COLUMNS = 'id, user_id, repo_url, status, public_slug, created_at, completed_at';

const startSchema = z.object({
  repoUrl: z.string().url().regex(/github\.com/, 'Must be a GitHub URL'),
});

// POST /api/audits — start a new audit
auditRouter.post('/', optionalAuth, async (req: AuthRequest, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const auditId = uuidv4();
  const publicSlug = auditId.slice(0, 8);

  // Owner token: lets whoever created this audit cancel/delete it later without an
  // account. Returned once in this response — only the hash is persisted.
  const ownerToken = crypto.randomBytes(24).toString('hex');
  const ownerTokenHash = await bcrypt.hash(ownerToken, 10);

  await db.query(
    'INSERT INTO audits (id, user_id, repo_url, status, public_slug, owner_token_hash) VALUES ($1, $2, $3, $4, $5, $6)',
    [auditId, req.userId ?? null, parsed.data.repoUrl, 'queued', publicSlug, ownerTokenHash]
  );

  await enqueueAudit({ auditId, repoUrl: parsed.data.repoUrl, userId: req.userId });

  res.status(202).json({ auditId, publicSlug, ownerToken });
});

// GET /api/audits/recent — public list of recent audits
auditRouter.get('/recent', async (_req, res) => {
  const result = await db.query(
    `SELECT ${AUDIT_COLUMNS} FROM audits ORDER BY created_at DESC LIMIT 20`
  );
  res.json({ audits: result.rows });
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only the creator (matching account, or matching owner token) may cancel/delete.
async function assertOwnership(req: AuthRequest, auditId: string): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const result = await db.query(
    `SELECT ${AUDIT_COLUMNS}, owner_token_hash FROM audits WHERE id = $1`,
    [auditId]
  );
  const audit = result.rows[0];
  if (!audit) return { ok: false, status: 404, error: 'Not found' };

  if (req.userId && audit.user_id && req.userId === audit.user_id) {
    return { ok: true };
  }

  const providedToken = req.header('X-Owner-Token');
  if (providedToken && audit.owner_token_hash && await bcrypt.compare(providedToken, audit.owner_token_hash)) {
    return { ok: true };
  }

  return { ok: false, status: 403, error: 'Not authorized to modify this audit' };
}

// GET /api/audits/:id — get audit status + events
auditRouter.get('/:id', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) { res.status(400).json({ error: 'Invalid audit ID' }); return; }
  const audit = await db.query(`SELECT ${AUDIT_COLUMNS} FROM audits WHERE id = $1`, [req.params.id]);
  if (!audit.rows[0]) { res.status(404).json({ error: 'Not found' }); return; }

  const events = await db.query(
    'SELECT * FROM audit_events WHERE audit_id = $1 ORDER BY created_at ASC',
    [req.params.id]
  );
  const findings = await db.query(
    'SELECT * FROM findings WHERE audit_id = $1 ORDER BY severity, created_at',
    [req.params.id]
  );

  res.json({ audit: audit.rows[0], events: events.rows, findings: findings.rows });
});

// DELETE /api/audits/:id — delete an audit and all its data
auditRouter.delete('/:id', optionalAuth, async (req: AuthRequest, res) => {
  if (!UUID_RE.test(req.params.id)) { res.status(400).json({ error: 'Invalid audit ID' }); return; }

  const ownership = await assertOwnership(req, req.params.id);
  if (!ownership.ok) { res.status(ownership.status).json({ error: ownership.error }); return; }

  await db.query('DELETE FROM audits WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// POST /api/audits/:id/cancel — cancel a queued or running audit
auditRouter.post('/:id/cancel', optionalAuth, async (req: AuthRequest, res) => {
  if (!UUID_RE.test(req.params.id)) { res.status(400).json({ error: 'Invalid audit ID' }); return; }

  const ownership = await assertOwnership(req, req.params.id);
  if (!ownership.ok) { res.status(ownership.status).json({ error: ownership.error }); return; }

  const result = await db.query(
    `UPDATE audits SET status = 'failed' WHERE id = $1 AND status IN ('queued', 'running') RETURNING id`,
    [req.params.id]
  );
  if (!result.rows[0]) { res.status(404).json({ error: 'Audit not found or already finished' }); return; }
  res.json({ ok: true });
});

// GET /api/audits — list user's audits
auditRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  const result = await db.query(
    `SELECT ${AUDIT_COLUMNS} FROM audits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.userId]
  );
  res.json({ audits: result.rows });
});
