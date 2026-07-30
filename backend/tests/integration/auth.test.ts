import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN } from '../setup';

const app = createApp();

describe('POST /api/auth/login', () => {
  it('rejects an unknown email', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nope@innocito.com', password: 'whatever123' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a valid email with the wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: TEST_ADMIN.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects malformed payloads (validation middleware)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('logs in with valid credentials and returns an access token + permissions', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.role).toBe('ADMIN');
    expect(res.body.data.user.permissions).toContain('users:manage');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('rejects requests to protected routes with no token', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(401);
  });

  it('rejects requests with a malformed bearer token', async () => {
    const res = await request(app).get('/api/leads').set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me returns the authenticated user', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password });
    const token = login.body.data.accessToken;
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(TEST_ADMIN.email);
  });
});
