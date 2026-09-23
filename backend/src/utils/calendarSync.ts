import { logger } from '@/config/logger';
import {
  getValidAccessToken,
  hasCalendarScope,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  type OAuthProvider,
  type CalendarEventInput,
} from '@/modules/integrations/integrations.service';

/**
 * Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 3: syncing the
 * existing Meetings module (a purely internal CRM record until now) to the meeting's creator's own
 * connected Google/Microsoft calendar. One-way only (CRM → calendar) — nothing reads back from the
 * provider. Calendar identity always follows the meeting's `createdById`, mirroring
 * utils/emailSender.ts using the enrolled-owner's connection rather than whoever is currently
 * acting; meetings.service.ts is the only caller.
 *
 * Unlike emailSender.ts, there is no SMTP-style fallback: a meeting with no connected creator (or
 * one connected before the calendar scope existed) simply stays CRM-only — NOT_CONNECTED, not an
 * error. This is opportunistic, best-effort sync, never a requirement for scheduling a meeting.
 */

export type CalendarSyncOutcome =
  | { status: 'NOT_CONNECTED' }
  | { status: 'SYNCED'; provider: OAuthProvider; externalEventId: string }
  | { status: 'FAILED'; error: string };

export interface MeetingSyncInput {
  title: string;
  scheduledAt: Date;
  durationMins: number;
  location: string | null;
  attendees: string[];
  leadContactEmail?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * `attendees` is free text (see meetings.validation.ts — no format enforced, a rep may type a
 * name instead of an email), so this keeps only entries that look like an email address; a
 * non-email entry is silently dropped rather than sent to the provider, which would just reject
 * the whole request. The lead's own contact email (when known) is always added, deduplicated.
 */
export function buildAttendeeEmails(input: Pick<MeetingSyncInput, 'attendees' | 'leadContactEmail'>): string[] {
  const emails = new Set(input.attendees.filter((a) => EMAIL_RE.test(a)));
  if (input.leadContactEmail) emails.add(input.leadContactEmail);
  return [...emails];
}

/** Pure: turns a meeting's fields into the provider-agnostic event shape the calendar client calls need. */
export function toCalendarEventInput(input: MeetingSyncInput): CalendarEventInput {
  return {
    title: input.title,
    startAt: input.scheduledAt,
    endAt: new Date(input.scheduledAt.getTime() + input.durationMins * 60_000),
    location: input.location,
    attendeeEmails: buildAttendeeEmails(input),
  };
}

async function resolveCalendarConnection(userId: string): Promise<{ provider: OAuthProvider; accessToken: string } | null> {
  const connection = await getValidAccessToken(userId);
  if (!connection || !hasCalendarScope(connection.provider, connection.scope)) return null;
  return { provider: connection.provider, accessToken: connection.accessToken };
}

/** Creates a calendar event for a newly-scheduled meeting. Never throws — a calendar hiccup must
 * never block scheduling the meeting itself in the CRM. */
export async function syncMeetingCreated(userId: string | null, input: MeetingSyncInput): Promise<CalendarSyncOutcome> {
  if (!userId) return { status: 'NOT_CONNECTED' };
  const connection = await resolveCalendarConnection(userId);
  if (!connection) return { status: 'NOT_CONNECTED' };

  try {
    const externalEventId = await createCalendarEvent(connection.provider, connection.accessToken, toCalendarEventInput(input));
    return { status: 'SYNCED', provider: connection.provider, externalEventId };
  } catch (err) {
    logger.error({ err, userId }, '[calendarSync] Event create failed');
    return { status: 'FAILED', error: err instanceof Error ? err.message : 'Unknown calendar error' };
  }
}

/**
 * Updates (or, if the meeting was never synced before, attempts to create) a calendar event for an
 * edited meeting — so reconnecting later, or a transient failure clearing up, catches up on the
 * next edit rather than staying stuck NOT_CONNECTED/FAILED forever. Never throws.
 */
export async function syncMeetingUpdated(
  userId: string | null,
  existing: { provider: OAuthProvider; externalEventId: string } | null,
  input: MeetingSyncInput
): Promise<CalendarSyncOutcome> {
  if (!userId) return { status: 'NOT_CONNECTED' };
  const connection = await resolveCalendarConnection(userId);
  if (!connection) return { status: 'NOT_CONNECTED' };

  try {
    if (existing && existing.provider === connection.provider) {
      await updateCalendarEvent(connection.provider, connection.accessToken, existing.externalEventId, toCalendarEventInput(input));
      return { status: 'SYNCED', provider: connection.provider, externalEventId: existing.externalEventId };
    }
    // No prior event, or the creator switched providers since the last sync — a plain create.
    const externalEventId = await createCalendarEvent(connection.provider, connection.accessToken, toCalendarEventInput(input));
    return { status: 'SYNCED', provider: connection.provider, externalEventId };
  } catch (err) {
    logger.error({ err, userId }, '[calendarSync] Event update failed');
    return { status: 'FAILED', error: err instanceof Error ? err.message : 'Unknown calendar error' };
  }
}

/** Best-effort delete — a failure here is logged, never thrown, since the CRM-side delete/cancel
 * this backs must always succeed regardless of the calendar provider's availability. */
export async function syncMeetingDeleted(userId: string | null, existing: { provider: OAuthProvider; externalEventId: string } | null): Promise<void> {
  if (!userId || !existing) return;
  const connection = await resolveCalendarConnection(userId);
  if (!connection || connection.provider !== existing.provider) return;

  try {
    await deleteCalendarEvent(connection.provider, connection.accessToken, existing.externalEventId);
  } catch (err) {
    logger.error({ err, userId }, '[calendarSync] Event delete failed (best-effort, ignored)');
  }
}
