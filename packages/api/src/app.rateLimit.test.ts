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

    expect(a1.headers['ratelimit-remaining']).toBe('9');
    expect(a2.headers['ratelimit-remaining']).toBe('8');
    // A different visitor through the same proxy starts fresh, not at 7.
    expect(b1.headers['ratelimit-remaining']).toBe('9');
  });

  it('uses the client Cloudflare appended, not a spoofed leading entry', async () => {
    const app = await loadApp('1');

    // Client sends its own X-Forwarded-For; Cloudflare appends the real IP.
    const res = await submit(app, '127.0.0.1, 203.0.113.9');

    // Not treated as localhost (which would skip the limiter and omit headers).
    expect(res.headers['ratelimit-remaining']).toBe('9');
  });

  it('refuses the 11th submission from one client within the hour', async () => {
    const app = await loadApp('1');
    for (let i = 0; i < 10; i++) {
      expect((await submit(app, '203.0.113.50')).status).toBe(400); // counted, then rejected as invalid
    }

    const blocked = await submit(app, '203.0.113.50');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/Too many audits/);

    // Other visitors are unaffected.
    expect((await submit(app, '198.51.100.8')).status).toBe(400);
  });

  it('ignores X-Forwarded-For when TRUST_PROXY is unset', async () => {
    const app = await loadApp();

    // supertest connects from loopback; a forged header must not change that.
    const res = await submit(app, '203.0.113.1');

    expect(res.status).toBe(400);
    expect(res.headers['ratelimit-remaining']).toBeUndefined();
  });
});

describe('sign-in rate limiter', () => {
  it('refuses the 11th login attempt from one client within 15 minutes', async () => {
    const app = await loadApp('1');
    const login = (ip: string) =>
      request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send({}); // invalid body: 400, no DB needed

    for (let i = 0; i < 10; i++) expect((await login('203.0.113.77')).status).toBe(400);

    const blocked = await login('203.0.113.77');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/Too many sign-in attempts/);

    expect((await login('198.51.100.9')).status).toBe(400); // other visitors unaffected
  });

  it('applies to registration too', async () => {
    const app = await loadApp('1');
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/auth/register').set('X-Forwarded-For', '203.0.113.78').send({});
    }
    const blocked = await request(app).post('/api/auth/register').set('X-Forwarded-For', '203.0.113.78').send({});
    expect(blocked.status).toBe(429);
  });
});
