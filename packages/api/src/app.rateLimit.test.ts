import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';

// Invalid bodies are rejected with 400 before any DB/queue work, but the
// limiter runs first and still counts them — so these tests need no Postgres.
vi.mock('./queue/auditQueue', () => ({ enqueueAudit: vi.fn() }));

async function loadApp(trustProxy?: string) {
  vi.resetModules();
  if (trustProxy === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = trustProxy;
  return (await import('./app')).default;
}

function submit(app: Awaited<ReturnType<typeof loadApp>>, forwardedFor: string) {
  return request(app).post('/api/audits').set('X-Forwarded-For', forwardedFor).send({});
}

afterEach(() => {
  delete process.env.TRUST_PROXY;
});

describe('audit rate limiter behind a proxy', () => {
  it('gives each forwarded client its own bucket when TRUST_PROXY=1', async () => {
    const app = await loadApp('1');

    const a1 = await submit(app, '203.0.113.1');
    const a2 = await submit(app, '203.0.113.1');
    const b1 = await submit(app, '198.51.100.7');

    expect(a1.headers['ratelimit-remaining']).toBe('99');
    expect(a2.headers['ratelimit-remaining']).toBe('98');
    // A different visitor through the same proxy starts fresh, not at 97.
    expect(b1.headers['ratelimit-remaining']).toBe('99');
  });

  it('uses the client Cloudflare appended, not a spoofed leading entry', async () => {
    const app = await loadApp('1');

    // Client sends its own X-Forwarded-For; Cloudflare appends the real IP.
    const res = await submit(app, '127.0.0.1, 203.0.113.9');

    // Not treated as localhost (which would skip the limiter and omit headers).
    expect(res.headers['ratelimit-remaining']).toBe('99');
  });

  it('ignores X-Forwarded-For when TRUST_PROXY is unset', async () => {
    const app = await loadApp();

    // supertest connects from loopback; a forged header must not change that.
    const res = await submit(app, '203.0.113.1');

    expect(res.status).toBe(400);
    expect(res.headers['ratelimit-remaining']).toBeUndefined();
  });
});
