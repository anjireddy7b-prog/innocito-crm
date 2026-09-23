import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_INSIDE_SALES } from '../setup';

const app = createApp();

// reports.routes.ts's pre-existing leads export routes have no dedicated test file; this one
// covers only the two routes Phase 9's "import/export hardening" slice adds (companies/contacts
// CSV export), reusing the same REPORTS_EXPORT-gated router the leads routes already sit on.

let adminToken: string;
let insideSalesToken: string; // lacks REPORTS_EXPORT (see permissions.ts's ROLE_PERMISSIONS)

let companyName: string;
let contactEmail: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
  const insideSales = await request(app).post('/api/auth/login').send(TEST_INSIDE_SALES);
  insideSalesToken = insideSales.body.data.accessToken;

  const stamp = Date.now().toString(36);
  companyName = `Export Test Co ${stamp}`;
  const companyRes = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: companyName, industry: 'Software' });
  expect(companyRes.status).toBe(201);

  contactEmail = `export.contact.${stamp}@example.com`;
  const contactRes = await request(app)
    .post('/api/contacts')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ companyId: companyRes.body.data.id, firstName: 'Export', lastName: 'Contact', email: contactEmail });
  expect(contactRes.status).toBe(201);
});

describe('Reports export — Companies and Contacts CSV', () => {
  it('rejects a user without reports:export permission', async () => {
    const res = await request(app).get('/api/reports/companies/export.csv').set('Authorization', `Bearer ${insideSalesToken}`);
    expect(res.status).toBe(403);
  });

  it('exports companies as CSV with the expected headers and content', async () => {
    const res = await request(app).get('/api/reports/companies/export.csv').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('companies-export.csv');
    expect(res.text).toContain('Company,Domain,Website,Industry');
    expect(res.text).toContain(companyName);
  });

  it('exports contacts as CSV with the expected headers and content', async () => {
    const res = await request(app).get('/api/reports/contacts/export.csv').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('contacts-export.csv');
    expect(res.text).toContain('Contact,Company,Designation,Email');
    expect(res.text).toContain(contactEmail);
    expect(res.text).toContain(companyName);
  });
});
