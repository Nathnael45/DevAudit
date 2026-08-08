import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { db } from '../db/client';

async function createAudit(slug: string, status: string): Promise<string> {
  const result = await db.query(
    `INSERT INTO audits (repo_url, status, public_slug) VALUES ($1, $2, $3) RETURNING id`,
    ['https://github.com/octocat/Hello-World', status, slug]
  );
  return result.rows[0].id;
}

async function insertFinding(auditId: string, severity: string, title: string) {
  await db.query(
    `INSERT INTO findings (audit_id, severity, title) VALUES ($1, $2, $3)`,
    [auditId, severity, title]
  );
}

async function insertSummary(auditId: string, content: string) {
  await db.query(
    `INSERT INTO audit_events (audit_id, type, content) VALUES ($1, 'summary', $2)`,
    [auditId, content]
  );
}

beforeEach(async () => {
  await db.query('TRUNCATE TABLE audits, users, findings, audit_events RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await db.end();
});

describe('GET /api/reports/:slug', () => {
  it('returns the audit, its summary, and findings ordered by severity', async () => {
    const auditId = await createAudit('abc123', 'done');
    await insertFinding(auditId, 'low', 'Minor issue');
    await insertFinding(auditId, 'critical', 'SQL injection');
    await insertFinding(auditId, 'medium', 'Missing rate limit');
    await insertSummary(auditId, 'Found 3 issues.');

    const res = await request(app).get('/api/reports/abc123');

    expect(res.status).toBe(200);
    expect(res.body.audit.public_slug).toBe('abc123');
    expect(res.body.summary).toBe('Found 3 issues.');
    expect(res.body.findings.map((f: any) => f.severity)).toEqual(['critical', 'medium', 'low']);
  });

  it('returns null summary when no summary event was recorded', async () => {
    await createAudit('nosummary', 'done');

    const res = await request(app).get('/api/reports/nosummary');

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeNull();
    expect(res.body.findings).toEqual([]);
  });

  it('returns 404 for a slug that does not exist', async () => {
    const res = await request(app).get('/api/reports/does-not-exist');
    expect(res.status).toBe(404);
  });

  it("returns 404 for a real audit that hasn't finished yet, so unfinished work isn't shared", async () => {
    await createAudit('stillrunning', 'running');

    const res = await request(app).get('/api/reports/stillrunning');
    expect(res.status).toBe(404);
  });
});
