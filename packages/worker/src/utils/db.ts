import { Pool } from 'pg';

export const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function updateAuditStatus(auditId: string, status: string) {
  await db.query('UPDATE audits SET status = $1 WHERE id = $2', [status, auditId]);
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
