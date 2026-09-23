import { describe, it, expect } from 'vitest';
import { buildAttendeeEmails, toCalendarEventInput } from '@/utils/calendarSync';

// Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 3. Only the pure
// parts (no network, no DB) are unit-tested here — the exact same split as
// tests/unit/sequenceScheduling.test.ts for Stage 2's date math. The network-dependent orchestration
// (syncMeetingCreated/Updated/Deleted) is exercised indirectly by tests/integration/meetings.test.ts,
// which can only ever reach the NOT_CONNECTED branch in this sandbox (no real Google/Microsoft
// calendar API is reachable here — the same class of limitation documented in integrations.test.ts
// for real OAuth token exchange).

describe('calendarSync — buildAttendeeEmails', () => {
  it('keeps only entries that look like an email address', () => {
    expect(buildAttendeeEmails({ attendees: ['Jane Doe', 'jane@example.com', 'not-an-email'], leadContactEmail: null })).toEqual(['jane@example.com']);
  });

  it('adds the lead contact email when present', () => {
    expect(buildAttendeeEmails({ attendees: [], leadContactEmail: 'lead@example.com' })).toEqual(['lead@example.com']);
  });

  it('deduplicates when the same email appears in both attendees and the lead contact', () => {
    expect(buildAttendeeEmails({ attendees: ['lead@example.com'], leadContactEmail: 'lead@example.com' })).toEqual(['lead@example.com']);
  });

  it('returns an empty array when there is nothing valid at all', () => {
    expect(buildAttendeeEmails({ attendees: ['not an email', ''], leadContactEmail: null })).toEqual([]);
  });
});

describe('calendarSync — toCalendarEventInput', () => {
  it('derives endAt from scheduledAt + durationMins and carries the filtered attendee list through', () => {
    const scheduledAt = new Date('2026-10-01T15:00:00.000Z');
    const result = toCalendarEventInput({
      title: 'Discovery call',
      scheduledAt,
      durationMins: 45,
      location: 'Zoom',
      attendees: ['rep-note-not-an-email', 'client@example.com'],
      leadContactEmail: 'contact@example.com',
    });
    expect(result.title).toBe('Discovery call');
    expect(result.startAt).toEqual(scheduledAt);
    expect(result.endAt).toEqual(new Date('2026-10-01T15:45:00.000Z'));
    expect(result.location).toBe('Zoom');
    expect(result.attendeeEmails.sort()).toEqual(['client@example.com', 'contact@example.com']);
  });

  it('passes a null location through unchanged', () => {
    const result = toCalendarEventInput({
      title: 'Follow-up',
      scheduledAt: new Date('2026-10-01T15:00:00.000Z'),
      durationMins: 30,
      location: null,
      attendees: [],
      leadContactEmail: null,
    });
    expect(result.location).toBeNull();
    expect(result.attendeeEmails).toEqual([]);
  });
});
