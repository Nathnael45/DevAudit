import { Router } from 'express';
import { db } from '../db/client';

export const reportsRouter = Router();

// GET /api/reports/:slug — public shareable report by slug
reportsRouter.get('/:slug', async (req, res) => {
  const audit = await db.query(
    'SELECT * FROM audits WHERE public_slug = $1 AND status = $2',
    [req.params.slug, 'done']
  );
  if (!audit.rows[0]) { res.status(404).json({ error: 'Report not found' }); return; }

  const findings = await db.query(
    `SELECT * FROM findings WHERE audit_id = $1
     ORDER BY CASE severity
       WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3
       WHEN 'low' THEN 4 ELSE 5 END`,
    [audit.rows[0].id]
  );

  const summary = await db.query(
    `SELECT content FROM audit_events WHERE audit_id = $1 AND type = 'summary' LIMIT 1`,
    [audit.rows[0].id]
  );

  res.json({
    audit: audit.rows[0],
    findings: findings.rows,
    summary: summary.rows[0]?.content ?? null,
  });
});
