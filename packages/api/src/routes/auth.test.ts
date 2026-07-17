import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import { db } from '../db/client';

beforeEach(async () => {
  await db.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await db.end();
});

describe('POST /api/auth/register', () => {
  it('creates a user and returns a valid JWT', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');

    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET!) as { sub: string };
    const stored = await db.query('SELECT id FROM users WHERE email = $1', ['new@example.com']);
    expect(payload.sub).toBe(stored.rows[0].id);
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/api/auth/register').send({ email: 'dupe@example.com', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dupe@example.com', password: 'differentPassword1' });

    expect(res.status).toBe(409);
  });

  it('rejects an invalid email with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'not-an-email', password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('rejects a password under 8 characters with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'short@example.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('never stores the password in plaintext', async () => {
    await request(app).post('/api/auth/register').send({ email: 'hash@example.com', password: 'password123' });
    const stored = await db.query('SELECT password_hash FROM users WHERE email = $1', ['hash@example.com']);
    expect(stored.rows[0].password_hash).not.toBe('password123');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({ email: 'user@example.com', password: 'correctPassword1' });
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'user@example.com', password: 'correctPassword1' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  it('rejects an incorrect password with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'user@example.com', password: 'wrongPassword1' });
    expect(res.status).toBe(401);
  });

  it('rejects a nonexistent email with 401 (not a 404 that would leak account existence)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever1' });
    expect(res.status).toBe(401);
  });
});
