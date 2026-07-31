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

describe('Admin can edit an existing user\'s Email ID', () => {
  let userId: string;
  const originalEmail = `edit.email.target.${Date.now()}@innocito.com`;
  const secondUserEmail = `other.user.${Date.now()}@innocito.com`;

  beforeAll(async () => {
    const created = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: originalEmail, firstName: 'Edit', lastName: 'EmailTarget', roleName: 'SALES' });
    userId = created.body.data.user.id;
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: secondUserEmail, firstName: 'Other', lastName: 'User', roleName: 'SALES' });
  });

  it('a non-Admin cannot edit a user\'s email', async () => {
    const res = await request(app)
      .patch(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ email: 'should.not.apply@innocito.com' });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid email format', async () => {
    const res = await request(app)
      .patch(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('rejects changing to an email already used by another user (case-insensitive)', async () => {
    const res = await request(app)
      .patch(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: secondUserEmail.toUpperCase() });
    expect(res.status).toBe(409);
  });

  it('an Admin can update the Email ID, and it becomes the account\'s address immediately', async () => {
    const newEmail = `updated.email.${Date.now()}@innocito.com`;
    const res = await request(app)
      .patch(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: newEmail });
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(newEmail);

    // GET by id reflects the change immediately (the same read path lead notifications, exports,
    // and every other consumer of a user's email ultimately go through).
    const fetched = await request(app).get(`/api/users/${userId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(fetched.body.data.email).toBe(newEmail);

    // The old address is fully released — it's usable by a *different* account, which would 409 if
    // the old row still held onto it in any form.
    const reuseOld = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: originalEmail, firstName: 'Reuses', lastName: 'OldEmail', roleName: 'SALES' });
    expect(reuseOld.status).toBe(201);

    // A dedicated, filterable audit trail entry exists for the change.
    const audit = await request(app)
      .get(`/api/audit-logs?action=EMAIL_CHANGED&entityType=User`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(audit.status).toBe(200);
    const entry = audit.body.data.find((a: any) => a.entityId === userId);
    expect(entry).toBeTruthy();
    expect(entry.oldValues.email).toBe(originalEmail);
    expect(entry.newValues.email).toBe(newEmail);
  });

  it('resubmitting the same email is a no-op — no duplicate EMAIL_CHANGED entry, no conflict error', async () => {
    const current = await request(app).get(`/api/users/${userId}`).set('Authorization', `Bearer ${adminToken}`);
    const res = await request(app)
      .patch(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: current.body.data.email, firstName: 'Edit' });
    expect(res.status).toBe(200);

    const audit = await request(app)
      .get(`/api/audit-logs?action=EMAIL_CHANGED&entityType=User`)
      .set('Authorization', `Bearer ${adminToken}`);
    const entriesForUser = audit.body.data.filter((a: any) => a.entityId === userId);
    expect(entriesForUser).toHaveLength(1); // still just the one from the actual change above
  });
});
