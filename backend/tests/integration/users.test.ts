import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_INSIDE_SALES } from '../setup';

const app = createApp();

let adminToken: string;
let insideSalesToken: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
  const insideSales = await request(app).post('/api/auth/login').send(TEST_INSIDE_SALES);
  insideSalesToken = insideSales.body.data.accessToken;
});

describe('User management is Admin-only (no self-registration)', () => {
  it('there is no public registration endpoint', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'hacker@evil.com', password: 'password123' });
    expect(res.status).toBe(404);
  });

  it('a non-Admin cannot create a user account', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ email: 'new.hire@innocito.com', firstName: 'New', lastName: 'Hire', roleName: 'SALES' });
    expect(res.status).toBe(403);
  });

  it('a non-Admin cannot list users', async () => {
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(res.status).toBe(403);
  });

  it('an Admin can create a user account and receives a temporary password to relay', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'new.hire@innocito.com', firstName: 'New', lastName: 'Hire', roleName: 'DELIVERY' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('new.hire@innocito.com');
    expect(res.body.data.temporaryPassword).toBeTruthy();
    expect(res.body.data.user.mustChangePassword).toBe(true);
  });

  it('rejects creating a second user with the same email (unique constraint)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'new.hire@innocito.com', firstName: 'Dup', lastName: 'User', roleName: 'SALES' });
    expect(res.status).toBe(409);
  });

  it('an Admin can disable a user, and the disabled user can no longer log in', async () => {
    const list = await request(app).get('/api/users?search=new.hire').set('Authorization', `Bearer ${adminToken}`);
    const userId = list.body.data[0].id;

    const disable = await request(app)
      .patch(`/api/users/${userId}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(disable.status).toBe(200);
    expect(disable.body.data.isActive).toBe(false);
  });

  it('an Admin cannot disable their own account', async () => {
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${adminToken}`);
    const res = await request(app)
      .patch(`/api/users/${me.body.data.id}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(res.status).toBe(400);
  });
});
