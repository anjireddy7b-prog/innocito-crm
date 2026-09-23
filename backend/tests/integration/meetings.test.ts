import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { TEST_INSIDE_SALES } from '../setup';

const app = createApp();

// Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 3 (calendar sync on
// top of the pre-existing Meetings module). No meetings tests existed before this file. Like
// integrations.test.ts, vitest.config.ts's test env sets no GOOGLE_*/MICROSOFT_* vars, so
// TEST_INSIDE_SALES never has a real OAuth connection here — every meeting created or updated in
// this file can only ever land on the NOT_CONNECTED branch of calendarSync.ts. That branch, and the
// "no crash regardless" contract around it, is exactly what these tests verify; the SYNCED/FAILED
// branches (real network calls to Google/Microsoft) are covered instead by
// tests/unit/calendarSyncOrchestration.test.ts's mocked unit tests — the same split
// integrations.test.ts documents for real OAuth token exchange.

let insideSalesToken: string;
let leadId: string;

beforeAll(async () => {
  const insideSales = await request(app).post('/api/auth/login').send(TEST_INSIDE_SALES);
  insideSalesToken = insideSales.body.data.accessToken;

  const stamp = Date.now().toString(36);
  const leadRes = await request(app)
    .post('/api/leads')
    .set('Authorization', `Bearer ${insideSalesToken}`)
    .send({ companyName: `Meeting Test Co ${stamp}`, contact: { firstName: 'Meeting', lastName: 'Test', email: `meeting.test.${stamp}@example.com` } });
  leadId = leadRes.body.data.id;
});

describe('Meetings — auth gating', () => {
  it('rejects an unauthenticated list request', async () => {
    const res = await request(app).get('/api/meetings');
    expect(res.status).toBe(401);
  });
});

describe('Meetings — calendar sync (Stage 3)', () => {
  it('creates a meeting as NOT_CONNECTED when the creator has no calendar-capable connection', async () => {
    const res = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ leadId, title: 'Discovery call', scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), durationMins: 30 });

    expect(res.status).toBe(201);
    expect(res.body.data.calendarSyncStatus).toBe('NOT_CONNECTED');
    expect(res.body.data.externalEventId).toBeNull();
    expect(res.body.data.externalCalendarProvider).toBeNull();
    expect(res.body.data.calendarSyncError).toBeNull();
  });

  it('stays NOT_CONNECTED (and does not error) when a calendar-relevant field is edited', async () => {
    const created = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ leadId, title: 'Follow-up call', scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), durationMins: 30 });
    const meetingId = created.body.data.id;

    const updated = await request(app)
      .patch(`/api/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString() });

    expect(updated.status).toBe(200);
    expect(updated.body.data.calendarSyncStatus).toBe('NOT_CONNECTED');
  });

  it('leaves calendar fields untouched when only a non-calendar field (mom) is edited', async () => {
    const created = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ leadId, title: 'Demo call', scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), durationMins: 30 });
    const meetingId = created.body.data.id;

    const updated = await request(app)
      .patch(`/api/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ mom: 'Discussed pricing and next steps.' });

    expect(updated.status).toBe(200);
    expect(updated.body.data.mom).toBe('Discussed pricing and next steps.');
    expect(updated.body.data.calendarSyncStatus).toBe('NOT_CONNECTED');
  });

  it('cancelling a meeting never errors, even with no calendar event to clean up', async () => {
    const created = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ leadId, title: 'Cancelled call', scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), durationMins: 30 });
    const meetingId = created.body.data.id;

    const cancelled = await request(app)
      .patch(`/api/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ status: 'CANCELLED' });

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(cancelled.body.data.calendarSyncStatus).toBe('NOT_CONNECTED');
    expect(cancelled.body.data.externalEventId).toBeNull();
  });

  it('deleting a meeting always succeeds regardless of calendar sync state', async () => {
    const created = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${insideSalesToken}`)
      .send({ leadId, title: 'Deletable call', scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), durationMins: 30 });
    const meetingId = created.body.data.id;

    const deleted = await request(app).delete(`/api/meetings/${meetingId}`).set('Authorization', `Bearer ${insideSalesToken}`);
    expect(deleted.status).toBe(204);
  });
});
