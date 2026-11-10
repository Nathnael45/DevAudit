import { Router } from 'express';
import { db } from '../db/client';
import { SEVERITY_ORDER_SQL } from '../db/severity';

export const reportsRouter = Router();

// GET /api/reports/:slug — public shareable report by slug
reportsRouter.get('/:slug', async (req, res) => {
  const audit = await db.query(
    `SELECT id, user_id, repo_url, status, public_slug, created_at, completed_at, timings
     FROM audits WHERE public_slug = $1 AND status = $2`,
    [req.params.slug, 'done']
  );
  if (!audit.rows[0]) { res.status(404).json({ error: 'Report not found' }); return; }

  const findings = await db.query(
    `SELECT * FROM findings WHERE audit_id = $1
     ORDER BY ${SEVERITY_ORDER_SQL}`,
    [audit.rows[0].id]
  );

  // Report text lives in the audit's event log: 'summary' is Claude's full
  // reasoning, 'executive_summary' the TL;DR, 'scan_stats' the raw-alert counts.
  // Audits from before the TL;DR existed simply have no rows for the latter two.
  const events = await db.query(
    `SELECT type, content, metadata FROM audit_events
     WHERE audit_id = $1 AND type IN ('summary', 'executive_summary', 'scan_stats')`,
    [audit.rows[0].id]
  );
  const byType = (type: string) => events.rows.find((e) => e.type === type);

  res.json({
    audit: audit.rows[0],
    findings: findings.rows,
    summary: byType('summary')?.content ?? null,
    tldr: byType('executive_summary')?.content ?? null,
    scanStats: byType('scan_stats')?.metadata ?? null,
  });
});
