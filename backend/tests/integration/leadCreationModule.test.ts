import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN, TEST_INSIDE_SALES } from '../setup';

const app = createApp();

let adminToken: string;
let insideSalesToken: string;
let insideSalesUserId: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
  const insideSales = await request(app).post('/api/auth/login').send(TEST_INSIDE_SALES);
  insideSalesToken = insideSales.body.data.accessToken;
  insideSalesUserId = insideSales.body.data.user.id;
});

describe('Lead Creation module — new fields end to end', () => {
  it('the expanded Campaign list (Staffing, Pen Testing, AI-Led QE, AI-Led DE, Generic) is present alongside any pre-existing campaigns', async () => {
    const res = await request(app).get('/api/campaigns?pageSize=100').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const codes = res.body.data.map((c: any) => c.code);
    expect(codes).toEqual(expect.arrayContaining(['STAFFING', 'PENTEST', 'AI_LED_QE', 'AI_LED_DE', 'GENERIC']));
  });

  it('the SDR dropdown data source (/users/assignable?roles=INSIDE_SALES) includes the active Inside Sales test user, with no hardcoding', async () => {
    const res = await request(app).get('/api/users/assignable?roles=INSIDE_SALES').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((u: any) => u.id === insideSalesUserId)).toBe(true);
  });

  let leadId: string;
  let companyName: string;

  it('creates a lead using every new field at once', async () => {
    companyName = `Full Field Test Co ${Date.now().toString(36)}`;
    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({
        companyName,
        company: {
          industry: 'Healthcare',
          country: 'USA',
          state: 'Texas',
          website: 'fullfieldtest.com',
          annualRevenue: 5000000,
        },
        contact: { firstName: 'Pat', lastName: 'Rivera', email: 'pat.rivera@fullfieldtest.com' },
        source: 'WEBSITE',
        priority: 'HIGH',
        sdrId: insideSalesUserId,
        leadReceivedDate: '2026-01-15',
        meetingScheduledDate: '2026-02-01',
        meetingScheduledTime: '14:30',
        meetingTimeZone: 'EST',
        emailResponse: 'Prospect replied asking for a demo next week.',
      });

    expect(res.status).toBe(201);
    leadId = res.body.data.id;

    expect(res.body.data.sdr.id).toBe(insideSalesUserId);
    expect(res.body.data.leadReceivedDate.slice(0, 10)).toBe('2026-01-15');
    expect(res.body.data.emailResponse).toBe('Prospect replied asking for a demo next week.');

    expect(res.body.data.company.industry).toBe('Healthcare');
    expect(res.body.data.company.country).toBe('USA');
    expect(res.body.data.company.state).toBe('Texas');
    expect(res.body.data.company.website).toBe('https://fullfieldtest.com'); // https:// auto-prefixed
    expect(Number(res.body.data.company.annualRevenue)).toBe(5000000);

    expect(res.body.data.meetings).toHaveLength(1);
    expect(res.body.data.meetings[0].timeZone).toBe('EST');
    expect(res.body.data.meetings[0].scheduledAt.slice(0, 16)).toBe('2026-02-01T14:30');
  });

  it('a second lead for the SAME (existing) company does not overwrite the first company\'s details', async () => {
    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({
        companyName, // matches the existing company by name
        company: { industry: 'Retail', country: 'India', website: 'someone-elses-guess.com' },
        contact: { firstName: 'Second', lastName: 'Contact' },
        source: 'REFERRAL',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.company.industry).toBe('Healthcare'); // unchanged from the first lead
    expect(res.body.data.company.country).toBe('USA'); // unchanged
  });

  it('Email Response is searchable via the leads list search', async () => {
    const res = await request(app)
      .get(`/api/leads?search=${encodeURIComponent('asking for a demo next week')}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((l: any) => l.id === leadId)).toBe(true);
  });

  it('filters the leads list by sdrId', async () => {
    const res = await request(app).get(`/api/leads?sdrId=${insideSalesUserId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((l: any) => l.id === leadId)).toBe(true);
  });

  it('Edit Lead can update sdrId, leadReceivedDate, and Email Response', async () => {
    const res = await request(app)
      .patch(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ leadReceivedDate: '2026-01-20', emailResponse: 'Updated response text.' });
    expect(res.status).toBe(200);
    expect(res.body.data.leadReceivedDate.slice(0, 10)).toBe('2026-01-20');
    expect(res.body.data.emailResponse).toBe('Updated response text.');
  });

  it('rejects an invalid Meeting Scheduled Time format', async () => {
    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ companyName: 'Bad Time Co', meetingScheduledDate: '2026-02-01', meetingScheduledTime: '2:30pm' });
    expect(res.status).toBe(400);
  });

  it('CSV export includes the new columns (Industry, Website, Revenue, SDR Name, Lead Received Date, Email Response)', async () => {
    const res = await request(app).get('/api/reports/leads/export.csv').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const header = res.text.split('\n')[0];
    for (const col of ['Industry', 'Website', 'Revenue', 'SDR Name', 'Lead Received Date', 'Email Response', 'State']) {
      expect(header).toContain(col);
    }
  });

  it('a company can be edited with a curated Industry/Country value', async () => {
    const companyRes = await request(app).get(`/api/leads/${leadId}`).set('Authorization', `Bearer ${adminToken}`);
    const companyId = companyRes.body.data.company.id;
    const res = await request(app)
      .patch(`/api/companies/${companyId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ industry: 'BFSI' });
    expect(res.status).toBe(200);
    expect(res.body.data.industry).toBe('BFSI');
  });

  it('backward compatibility: an arbitrary (non-curated) Industry/Country string is still accepted, not rejected by a hard enum', async () => {
    const res = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Legacy Free Text Co ${Date.now().toString(36)}`, industry: 'Some Legacy Value', country: 'Freetext Country' });
    expect(res.status).toBe(201);
    expect(res.body.data.industry).toBe('Some Legacy Value');

    // Editing an unrelated field afterward must not be blocked by the legacy industry/country value.
    const editRes = await request(app)
      .patch(`/api/companies/${res.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone: '+1 555 111 2222' });
    expect(editRes.status).toBe(200);
  });
});
