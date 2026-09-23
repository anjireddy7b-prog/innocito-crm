import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 3. A true unit test
// (no DB, no network): integrations.service's connection lookup and raw calendar calls are all
// mocked, mirroring emailSender.test.ts's exact pattern, so only syncMeetingCreated/Updated/
// Deleted's own branching is under test here.

const { getValidAccessTokenMock, hasCalendarScopeMock, createCalendarEventMock, updateCalendarEventMock, deleteCalendarEventMock } = vi.hoisted(() => ({
  getValidAccessTokenMock: vi.fn(),
  hasCalendarScopeMock: vi.fn(),
  createCalendarEventMock: vi.fn(),
  updateCalendarEventMock: vi.fn(),
  deleteCalendarEventMock: vi.fn(),
}));

vi.mock('@/modules/integrations/integrations.service', () => ({
  getValidAccessToken: getValidAccessTokenMock,
  hasCalendarScope: hasCalendarScopeMock,
  createCalendarEvent: createCalendarEventMock,
  updateCalendarEvent: updateCalendarEventMock,
  deleteCalendarEvent: deleteCalendarEventMock,
}));

import { syncMeetingCreated, syncMeetingUpdated, syncMeetingDeleted } from '@/utils/calendarSync';

const MEETING_INPUT = { title: 'Discovery call', scheduledAt: new Date('2026-10-01T15:00:00Z'), durationMins: 30, location: null, attendees: [] };

describe('calendarSync.syncMeetingCreated', () => {
  beforeEach(() => {
    getValidAccessTokenMock.mockReset();
    hasCalendarScopeMock.mockReset();
    createCalendarEventMock.mockReset();
  });

  it('reports NOT_CONNECTED when there is no creator at all', async () => {
    const result = await syncMeetingCreated(null, MEETING_INPUT);
    expect(result).toEqual({ status: 'NOT_CONNECTED' });
    expect(getValidAccessTokenMock).not.toHaveBeenCalled();
  });

  it('reports NOT_CONNECTED when the creator has no connection', async () => {
    getValidAccessTokenMock.mockResolvedValue(null);
    const result = await syncMeetingCreated('user-1', MEETING_INPUT);
    expect(result).toEqual({ status: 'NOT_CONNECTED' });
  });

  it('reports NOT_CONNECTED when connected but without calendar scope (pre-Stage-3 connection)', async () => {
    getValidAccessTokenMock.mockResolvedValue({ provider: 'GOOGLE', accessToken: 'tok', scope: 'gmail.send only' });
    hasCalendarScopeMock.mockReturnValue(false);
    const result = await syncMeetingCreated('user-1', MEETING_INPUT);
    expect(result).toEqual({ status: 'NOT_CONNECTED' });
    expect(createCalendarEventMock).not.toHaveBeenCalled();
  });

  it('creates the event and reports SYNCED when calendar-capable', async () => {
    getValidAccessTokenMock.mockResolvedValue({ provider: 'GOOGLE', accessToken: 'tok', scope: 'calendar.events' });
    hasCalendarScopeMock.mockReturnValue(true);
    createCalendarEventMock.mockResolvedValue('gcal-event-1');
    const result = await syncMeetingCreated('user-1', MEETING_INPUT);
    expect(result).toEqual({ status: 'SYNCED', provider: 'GOOGLE', externalEventId: 'gcal-event-1' });
  });

  it('reports FAILED (never throws) when the create call itself fails', async () => {
    getValidAccessTokenMock.mockResolvedValue({ provider: 'MICROSOFT', accessToken: 'tok', scope: 'Calendars.ReadWrite' });
    hasCalendarScopeMock.mockReturnValue(true);
    createCalendarEventMock.mockRejectedValue(new Error('Graph calendar event create failed'));
    const result = await syncMeetingCreated('user-1', MEETING_INPUT);
    expect(result).toEqual({ status: 'FAILED', error: 'Graph calendar event create failed' });
  });
});

describe('calendarSync.syncMeetingUpdated', () => {
  beforeEach(() => {
    getValidAccessTokenMock.mockReset();
    hasCalendarScopeMock.mockReset();
    createCalendarEventMock.mockReset();
    updateCalendarEventMock.mockReset();
  });

  it('patches the existing event in place when the provider is unchanged', async () => {
    getValidAccessTokenMock.mockResolvedValue({ provider: 'GOOGLE', accessToken: 'tok', scope: 'calendar.events' });
    hasCalendarScopeMock.mockReturnValue(true);
    const result = await syncMeetingUpdated('user-1', { provider: 'GOOGLE', externalEventId: 'gcal-1' }, MEETING_INPUT);
    expect(updateCalendarEventMock).toHaveBeenCalledWith('GOOGLE', 'tok', 'gcal-1', expect.any(Object));
    expect(createCalendarEventMock).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'SYNCED', provider: 'GOOGLE', externalEventId: 'gcal-1' });
  });

  it('creates a fresh event instead of patching when the creator switched providers since the last sync', async () => {
    getValidAccessTokenMock.mockResolvedValue({ provider: 'MICROSOFT', accessToken: 'tok', scope: 'Calendars.ReadWrite' });
    hasCalendarScopeMock.mockReturnValue(true);
    createCalendarEventMock.mockResolvedValue('graph-event-1');
    const result = await syncMeetingUpdated('user-1', { provider: 'GOOGLE', externalEventId: 'gcal-1' }, MEETING_INPUT);
    expect(updateCalendarEventMock).not.toHaveBeenCalled();
    expect(createCalendarEventMock).toHaveBeenCalled();
    expect(result).toEqual({ status: 'SYNCED', provider: 'MICROSOFT', externalEventId: 'graph-event-1' });
  });

  it('creates a fresh event when there was no prior event at all (a reconnect catch-up)', async () => {
    getValidAccessTokenMock.mockResolvedValue({ provider: 'GOOGLE', accessToken: 'tok', scope: 'calendar.events' });
    hasCalendarScopeMock.mockReturnValue(true);
    createCalendarEventMock.mockResolvedValue('gcal-2');
    const result = await syncMeetingUpdated('user-1', null, MEETING_INPUT);
    expect(createCalendarEventMock).toHaveBeenCalled();
    expect(result).toEqual({ status: 'SYNCED', provider: 'GOOGLE', externalEventId: 'gcal-2' });
  });

  it('reports FAILED without throwing when the patch call fails', async () => {
    getValidAccessTokenMock.mockResolvedValue({ provider: 'GOOGLE', accessToken: 'tok', scope: 'calendar.events' });
    hasCalendarScopeMock.mockReturnValue(true);
    updateCalendarEventMock.mockRejectedValue(new Error('Google Calendar event update failed'));
    const result = await syncMeetingUpdated('user-1', { provider: 'GOOGLE', externalEventId: 'gcal-1' }, MEETING_INPUT);
    expect(result).toEqual({ status: 'FAILED', error: 'Google Calendar event update failed' });
  });

  it('reports NOT_CONNECTED when the creator no longer has calendar access', async () => {
    getValidAccessTokenMock.mockResolvedValue(null);
    const result = await syncMeetingUpdated('user-1', { provider: 'GOOGLE', externalEventId: 'gcal-1' }, MEETING_INPUT);
    expect(result).toEqual({ status: 'NOT_CONNECTED' });
    expect(updateCalendarEventMock).not.toHaveBeenCalled();
  });
});

describe('calendarSync.syncMeetingDeleted', () => {
  beforeEach(() => {
    getValidAccessTokenMock.mockReset();
    hasCalendarScopeMock.mockReset();
    deleteCalendarEventMock.mockReset();
  });

  it('is a no-op when there was never an external event', async () => {
    await syncMeetingDeleted('user-1', null);
    expect(getValidAccessTokenMock).not.toHaveBeenCalled();
    expect(deleteCalendarEventMock).not.toHaveBeenCalled();
  });

  it('deletes the event when the creator is still calendar-capable on the same provider', async () => {
    getValidAccessTokenMock.mockResolvedValue({ provider: 'GOOGLE', accessToken: 'tok', scope: 'calendar.events' });
    hasCalendarScopeMock.mockReturnValue(true);
    await syncMeetingDeleted('user-1', { provider: 'GOOGLE', externalEventId: 'gcal-1' });
    expect(deleteCalendarEventMock).toHaveBeenCalledWith('GOOGLE', 'tok', 'gcal-1');
  });

  it('never throws even when the delete call itself fails (best-effort)', async () => {
    getValidAccessTokenMock.mockResolvedValue({ provider: 'GOOGLE', accessToken: 'tok', scope: 'calendar.events' });
    hasCalendarScopeMock.mockReturnValue(true);
    deleteCalendarEventMock.mockRejectedValue(new Error('Google calendar event delete failed'));
    await expect(syncMeetingDeleted('user-1', { provider: 'GOOGLE', externalEventId: 'gcal-1' })).resolves.toBeUndefined();
  });

  it('skips the delete call when the creator switched providers (nothing to clean up over there)', async () => {
    getValidAccessTokenMock.mockResolvedValue({ provider: 'MICROSOFT', accessToken: 'tok', scope: 'Calendars.ReadWrite' });
    hasCalendarScopeMock.mockReturnValue(true);
    await syncMeetingDeleted('user-1', { provider: 'GOOGLE', externalEventId: 'gcal-1' });
    expect(deleteCalendarEventMock).not.toHaveBeenCalled();
  });
});
