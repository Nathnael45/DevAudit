import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Deletion/cancellation/ownership are what this file tests — the actual queue
// (and therefore Redis) isn't part of that, so it's mocked out.
vi.mock('../queue/auditQueue', () => ({
  enqueueAudit: vi.fn().mockResolvedValue('fake-job-id'),
}));

import app from '../app';
import { db } from '../db/client';

async function createUser(email: string): Promise<string> {
  const result = await db.query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
    [email, 'unused-in-these-tests']
  );
  return result.rows[0].id;
}

function tokenFor(userId: string): string {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET!);
}

async function createAudit(auth?: string): Promise<{ auditId: string; ownerToken: string }> {
  const req = request(app).post('/api/audits');
  if (auth) req.set('Authorization', `Bearer ${auth}`);
  const res = await req.send({ repoUrl: 'https://github.com/octocat/Hello-World' });
  return res.body;
}

beforeEach(async () => {
  await db.query('TRUNCATE TABLE audits, users RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await db.end();
});

describe('POST /api/audits', () => {
  it('creates an audit and returns an owner token that is never stored in plaintext', async () => {
    const res = await request(app).post('/api/audits').send({ repoUrl: 'https://github.com/octocat/Hello-World' });

    expect(res.status).toBe(202);
    expect(typeof res.body.ownerToken).toBe('string');

    const stored = await db.query('SELECT owner_token_hash FROM audits WHERE id = $1', [res.body.auditId]);
    expect(stored.rows[0].owner_token_hash).not.toBe(res.body.ownerToken);
  });

  it('rejects a non-GitHub URL with 400', async () => {
    const res = await request(app).post('/api/audits').send({ repoUrl: 'https://example.com/foo/bar' });
    expect(res.status).toBe(400);
  });

  it("attaches the audit to the authenticated user's account when a valid token is provided", async () => {
    const userId = await createUser('creator@example.com');
    const { auditId } = await createAudit(tokenFor(userId));

    const stored = await db.query('SELECT user_id FROM audits WHERE id = $1', [auditId]);
    expect(stored.rows[0].user_id).toBe(userId);
  });
});

describe('GET /api/audits/recent and /api/audits/:id', () => {
  it('never leaks owner_token_hash in either response', async () => {
    const { auditId } = await createAudit();

    const recent = await request(app).get('/api/audits/recent');
    expect(JSON.stringify(recent.body)).not.toContain('owner_token_hash');

    const byId = await request(app).get(`/api/audits/${auditId}`);
    expect(JSON.stringify(byId.body)).not.toContain('owner_token_hash');
  });

  it('rejects a malformed id with 400', async () => {
    const res = await request(app).get('/api/audits/not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('returns 404 for a well-formed but nonexistent id', async () => {
    const res = await request(app).get('/api/audits/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/audits/:id', () => {
  it('rejects deletion with no token with 403, and leaves the audit intact', async () => {
    const { auditId } = await createAudit();

    const res = await request(app).delete(`/api/audits/${auditId}`);
    expect(res.status).toBe(403);

    const stored = await db.query('SELECT id FROM audits WHERE id = $1', [auditId]);
    expect(stored.rows).toHaveLength(1);
  });

  it('rejects deletion with the wrong token with 403', async () => {
    const { auditId } = await createAudit();
    const res = await request(app).delete(`/api/audits/${auditId}`).set('X-Owner-Token', 'totally-wrong');
    expect(res.status).toBe(403);
  });

  it('allows deletion with the correct owner token', async () => {
    const { auditId, ownerToken } = await createAudit();
    const res = await request(app).delete(`/api/audits/${auditId}`).set('X-Owner-Token', ownerToken);
    expect(res.status).toBe(200);

    const stored = await db.query('SELECT id FROM audits WHERE id = $1', [auditId]);
    expect(stored.rows).toHaveLength(0);
  });

  it('allows deletion by the owning authenticated account, with no token needed', async () => {
    const userId = await createUser('owner@example.com');
    const { auditId } = await createAudit(tokenFor(userId));

    const res = await request(app).delete(`/api/audits/${auditId}`).set('Authorization', `Bearer ${tokenFor(userId)}`);
    expect(res.status).toBe(200);
  });

  it('rejects deletion attempted by a different authenticated account', async () => {
    const ownerId = await createUser('real-owner@example.com');
    const attackerId = await createUser('attacker@example.com');
    const { auditId } = await createAudit(tokenFor(ownerId));

    const res = await request(app).delete(`/api/audits/${auditId}`).set('Authorization', `Bearer ${tokenFor(attackerId)}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/audits/:id/cancel', () => {
  it('rejects cancellation with no token with 403', async () => {
    const { auditId } = await createAudit();
    const res = await request(app).post(`/api/audits/${auditId}/cancel`);
    expect(res.status).toBe(403);
  });

  it('cancels a queued audit with the correct owner token', async () => {
    const { auditId, ownerToken } = await createAudit();
    const res = await request(app).post(`/api/audits/${auditId}/cancel`).set('X-Owner-Token', ownerToken);
    expect(res.status).toBe(200);

    const stored = await db.query('SELECT status FROM audits WHERE id = $1', [auditId]);
    expect(stored.rows[0].status).toBe('failed');
  });

  it('returns 404 when cancelling an audit that already finished', async () => {
    const { auditId, ownerToken } = await createAudit();
    await db.query("UPDATE audits SET status = 'done' WHERE id = $1", [auditId]);

    const res = await request(app).post(`/api/audits/${auditId}/cancel`).set('X-Owner-Token', ownerToken);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/audits (list mine)', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/audits');
    expect(res.status).toBe(401);
  });

  it("only returns the authenticated user's own audits, not everyone's", async () => {
    const userId = await createUser('mine@example.com');
    const otherUserId = await createUser('other@example.com');

    await createAudit(tokenFor(userId));
    await createAudit(tokenFor(otherUserId));

    const res = await request(app).get('/api/audits').set('Authorization', `Bearer ${tokenFor(userId)}`);
    expect(res.status).toBe(200);
    expect(res.body.audits).toHaveLength(1);
  });
});
