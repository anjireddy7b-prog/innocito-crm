import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_INSIDE_SALES, TEST_SALES } from '../setup';

const app = createApp();

let adminToken: string;
let insideSalesToken: string;
let salesToken: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
  const insideSales = await request(app).post('/api/auth/login').send(TEST_INSIDE_SALES);
  insideSalesToken = insideSales.body.data.accessToken;
  const sales = await request(app).post('/api/auth/login').send(TEST_SALES);
  salesToken = sales.body.data.accessToken;
});

describe('Leads lifecycle', () => {
  let leadId: string;

  it('Inside Sales can create a lead with an inline company + contact', async () => {
    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({
        companyName: 'Acme Testing Corp',
        contact: { firstName: 'Jane', lastName: 'Doe', email: 'jane.doe@acmetesting.com' },
        source: 'EMAIL',
        status: 'NEW',
        priority: 'HIGH',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.displayId).toMatch(/^LD-\d{6}$/);
    expect(res.body.data.company.name).toBe('Acme Testing Corp');
    expect(res.body.data.contact.email).toBe('jane.doe@acmetesting.com');
    leadId = res.body.data.id;
  });

  it('Sales rep without leads:create permission cannot create a lead', async () => {
    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ companyName: 'Should Not Be Created LLC' });
    expect(res.status).toBe(403);
  });

  it('lists leads and finds the created lead by company name search', async () => {
    const res = await request(app).get('/api/leads?search=Acme').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((l: any) => l.id === leadId)).toBe(true);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('fetches full lead detail including empty activity timeline scaffold', async () => {
    const res = await request(app).get(`/api/leads/${leadId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.activities.length).toBeGreaterThanOrEqual(1); // LEAD_CREATED activity
    expect(res.body.data.activities[0].type).toBe('LEAD_CREATED');
  });

  it('rejects an invalid status transition (NEW -> WON is not a legal jump)', async () => {
    const res = await request(app)
      .patch(`/api/leads/${leadId}/status`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ status: 'WON' });
    expect(res.status).toBe(400);
    expect(res.body.details?.allowed ?? res.body.message).toBeTruthy();
  });

  it('accepts a valid status transition (NEW -> CONTACTED)', async () => {
    const res = await request(app)
      .patch(`/api/leads/${leadId}/status`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ status: 'CONTACTED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONTACTED');
  });

  it('Inside Sales can assign the lead to a Sales rep', async () => {
    const salesUser = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${salesToken}`);
    const res = await request(app)
      .patch(`/api/leads/${leadId}/assign`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ currentOwnerId: salesUser.body.data.id });
    expect(res.status).toBe(200);
    expect(res.body.data.currentOwner.id).toBe(salesUser.body.data.id);
  });

  it('the newly-assigned Sales rep can now edit the lead (ownership-based edit permission)', async () => {
    const res = await request(app)
      .patch(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ nextSteps: 'Send proposal by Friday' });
    expect(res.status).toBe(200);
    expect(res.body.data.nextSteps).toBe('Send proposal by Friday');
  });

  it('only an Admin can hard-delete (deactivate) a lead', async () => {
    const forbidden = await request(app).delete(`/api/leads/${leadId}`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(forbidden.status).toBe(403);

    const allowed = await request(app).delete(`/api/leads/${leadId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(allowed.status).toBe(204);

    const listRes = await request(app).get('/api/leads?search=Acme').set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.body.data.some((l: any) => l.id === leadId)).toBe(false);
  });
});
