import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_ADMIN } from '../setup';

const app = createApp();

let adminToken: string;

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login').send(TEST_ADMIN);
  adminToken = admin.body.data.accessToken;
});

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const FUTURE_YEAR = CURRENT_YEAR + 5; // guaranteed to have no data, regardless of what other tests seed

describe('Dashboard summary period filtering', () => {
  it('defaults to all-time when no period is given, and reports appliedPeriod=all', async () => {
    const res = await request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.appliedPeriod).toEqual({ period: 'all', label: 'All Time' });
    expect(res.body.data.kpis).toBeDefined();
    expect(Array.isArray(res.body.data.monthlyTrends)).toBe(true);
  });

  it('rejects period=year without a year', async () => {
    const res = await request(app).get('/api/dashboard/summary?period=year').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('rejects period=quarter without a quarter', async () => {
    const res = await request(app).get(`/api/dashboard/summary?period=quarter&year=${CURRENT_YEAR}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('rejects period=month without a month', async () => {
    const res = await request(app).get(`/api/dashboard/summary?period=month&year=${CURRENT_YEAR}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('rejects an invalid period value', async () => {
    const res = await request(app).get('/api/dashboard/summary?period=decade').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('a far-future year with no data returns all-zero KPIs and empty breakdowns', async () => {
    const res = await request(app).get(`/api/dashboard/summary?period=year&year=${FUTURE_YEAR}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.kpis).toEqual({
      totalLeads: 0,
      qualifiedLeads: 0,
      meetingsCount: 0,
      opportunities: 0,
      wins: 0,
      losses: 0,
      conversionRate: 0,
    });
    expect(res.body.data.campaignPerformance).toEqual([]);
    expect(res.body.data.representativePerformance).toEqual([]);
    expect(res.body.data.monthlyTrends).toEqual([]);
    expect(res.body.data.appliedPeriod).toEqual({ period: 'year', year: FUTURE_YEAR, label: String(FUTURE_YEAR) });
  });

  it('a newly created lead is counted under the current year/quarter/month filters', async () => {
    const companyName = `Dashboard Period Test Co ${Date.now().toString(36)}`;
    const create = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ companyName, source: 'WEBSITE', status: 'NEW' });
    expect(create.status).toBe(201);

    const yearRes = await request(app).get(`/api/dashboard/summary?period=year&year=${CURRENT_YEAR}`).set('Authorization', `Bearer ${adminToken}`);
    expect(yearRes.status).toBe(200);
    expect(yearRes.body.data.kpis.totalLeads).toBeGreaterThanOrEqual(1);

    const quarter = Math.floor(now.getMonth() / 3) + 1;
    const quarterRes = await request(app)
      .get(`/api/dashboard/summary?period=quarter&year=${CURRENT_YEAR}&quarter=${quarter}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(quarterRes.status).toBe(200);
    expect(quarterRes.body.data.kpis.totalLeads).toBeGreaterThanOrEqual(1);

    const month = now.getMonth() + 1;
    const monthRes = await request(app)
      .get(`/api/dashboard/summary?period=month&year=${CURRENT_YEAR}&month=${month}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(monthRes.status).toBe(200);
    expect(monthRes.body.data.kpis.totalLeads).toBeGreaterThanOrEqual(1);
    expect(monthRes.body.data.appliedPeriod.period).toBe('month');

    // The same lead must NOT show up under a period it wasn't created in.
    const futureRes = await request(app)
      .get(`/api/dashboard/summary?period=year&year=${FUTURE_YEAR}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(futureRes.body.data.kpis.totalLeads).toBe(0);
  });
});
