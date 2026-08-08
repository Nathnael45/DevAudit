import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app';

describe('POST /internal/broadcast', () => {
  it('rejects a request with no secret with 401', async () => {
    const res = await request(app)
      .post('/internal/broadcast')
      .send({ auditId: 'audit-1', type: 'thought', content: 'hi' });

    expect(res.status).toBe(401);
  });

  it('rejects a request with the wrong secret with 401', async () => {
    const res = await request(app)
      .post('/internal/broadcast')
      .set('X-Internal-Secret', 'totally-wrong-secret')
      .send({ auditId: 'audit-1', type: 'thought', content: 'hi' });

    expect(res.status).toBe(401);
  });

  it('rejects a request missing auditId with 400, even with the correct secret', async () => {
    const res = await request(app)
      .post('/internal/broadcast')
      .set('X-Internal-Secret', process.env.INTERNAL_SECRET!)
      .send({ type: 'thought', content: 'hi' });

    expect(res.status).toBe(400);
  });

  it('accepts a correctly authenticated broadcast', async () => {
    const res = await request(app)
      .post('/internal/broadcast')
      .set('X-Internal-Secret', process.env.INTERNAL_SECRET!)
      .send({ auditId: 'audit-1', type: 'thought', content: 'hi' });

    expect(res.status).toBe(204);
  });
});
