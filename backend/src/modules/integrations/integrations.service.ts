import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { emailConnections, users } from '@/db/schema';
import { env, googleOAuthEnabled, microsoftOAuthEnabled } from '@/config/env';
import { logger } from '@/config/logger';
import { ApiError } from '@/utils/ApiError';
import { encryptToken, decryptToken } from '@/utils/tokenCrypto';

/**
 * Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration. Stage 1 built this file
 * as OAuth connection infrastructure only (email-send scope); Stage 2 (sequences engine) built on
 * it via utils/emailSender.ts; Stage 3 (calendar sync, utils/calendarSync.ts) extended the same
 * connection's requested scope to include calendar access and added createCalendarEvent/
 * updateCalendarEvent/deleteCalendarEvent below, alongside sendViaProvider. A user optionally
 * connects their own Google or Microsoft account; SMTP (utils/emailer.ts) is the always-available
 * fallback for sending — there is no fallback for calendar sync, since there's no equivalent
 * generic calendar to sync to without a real connection (see calendarSync.ts).
 *
 * OAuth flow threading (why this needs a signed `state` JWT rather than a session):
 * `GET /connect-url` is an ordinary AUTHENTICATED API call (Bearer token attached) that returns a
 * provider consent-screen URL. The frontend then does a full-page navigation to that URL. The
 * provider's redirect back to `GET /callback` is an UNAUTHENTICATED browser navigation — it
 * cannot carry our JWT access token — so the connect-url embeds a separate short-lived signed
 * `state` token identifying which user initiated the flow. It's signed with the *existing*
 * JWT_ACCESS_SECRET (no new secret needed) and scoped with `purpose: 'oauth_connect'` so it can
 * never be confused with (or substituted for) a real access token even though they share a
 * signing key.
 */

const STATE_PURPOSE = 'oauth_connect';
const STATE_EXPIRES_IN = '10m';
// Refresh proactively once the access token has under this much life left, rather than waiting
// for it to fail outright — mirrors no specific prior precedent in this codebase, but is the
// standard "refresh ahead of expiry" approach for OAuth access tokens.
const REFRESH_SKEW_MS = 5 * 60 * 1000;

export type OAuthProvider = 'GOOGLE' | 'MICROSOFT';

interface OAuthState {
  purpose: typeof STATE_PURPOSE;
  sub: string; // userId
  provider: OAuthProvider;
}

function signState(userId: string, provider: OAuthProvider): string {
  const payload: OAuthState = { purpose: STATE_PURPOSE, sub: userId, provider };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: STATE_EXPIRES_IN } as jwt.SignOptions);
}

function verifyState(token: string, expectedProvider: OAuthProvider): OAuthState {
  let decoded: OAuthState;
  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as OAuthState;
  } catch {
    throw ApiError.badRequest('Invalid or expired OAuth state');
  }
  if (decoded.purpose !== STATE_PURPOSE || decoded.provider !== expectedProvider) {
    throw ApiError.badRequest('Invalid OAuth state');
  }
  return decoded;
}

// ----------------------------------------------------------------------------
// Provider configuration — endpoints only (no SDK; plain fetch, matching the codebase's existing
// lean-dependency style, same as nodemailer being the only email-related dependency today).
// ----------------------------------------------------------------------------
// Stage 3 ("calendar sync", see utils/calendarSync.ts) added the calendar scope below to both
// providers' request scope. A connection made under Stage 1/2 (email-send scope only) still has
// its OLD scope string persisted on its emailConnections row — CALENDAR_SCOPE_MARKER lets a
// caller tell "never granted calendar access" apart from "granted", so Settings can prompt an
// already-connected user to reconnect once, rather than silently never syncing their meetings.
const CALENDAR_SCOPE_MARKER: Record<OAuthProvider, string> = {
  GOOGLE: 'https://www.googleapis.com/auth/calendar.events',
  MICROSOFT: 'Calendars.ReadWrite',
};

export function hasCalendarScope(provider: OAuthProvider, scope: string | null | undefined): boolean {
  if (!scope) return false;
  return scope.includes(CALENDAR_SCOPE_MARKER[provider]);
}

const GOOGLE = {
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
  sendUrl: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
  calendarEventsUrl: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
  scope: `openid email https://www.googleapis.com/auth/gmail.send ${CALENDAR_SCOPE_MARKER.GOOGLE}`,
};
const MICROSOFT = {
  authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
  sendUrl: 'https://graph.microsoft.com/v1.0/me/sendMail',
  calendarEventsUrl: 'https://graph.microsoft.com/v1.0/me/events',
  scope: `offline_access User.Read Mail.Send ${CALENDAR_SCOPE_MARKER.MICROSOFT}`,
};

function assertProviderConfigured(provider: OAuthProvider) {
  if (provider === 'GOOGLE' && !googleOAuthEnabled) {
    throw ApiError.badRequest('Google integration is not configured on this server');
  }
  if (provider === 'MICROSOFT' && !microsoftOAuthEnabled) {
    throw ApiError.badRequest('Microsoft integration is not configured on this server');
  }
}

export function getConnectUrl(userId: string, provider: OAuthProvider): string {
  assertProviderConfigured(provider);
  const state = signState(userId, provider);
  const cfg = provider === 'GOOGLE' ? GOOGLE : MICROSOFT;
  const redirectUri = provider === 'GOOGLE' ? env.GOOGLE_REDIRECT_URI! : env.MICROSOFT_REDIRECT_URI!;
  const clientId = provider === 'GOOGLE' ? env.GOOGLE_CLIENT_ID! : env.MICROSOFT_CLIENT_ID!;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: cfg.scope,
    state,
    // Both providers: request a refresh token every time, not just on first consent, so
    // reconnecting after a disconnect doesn't silently lose refresh capability.
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${cfg.authUrl}?${params.toString()}`;
}

interface TokenExchangeResult {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scope?: string;
}

async function exchangeCodeForTokens(provider: OAuthProvider, code: string): Promise<TokenExchangeResult> {
  const cfg = provider === 'GOOGLE' ? GOOGLE : MICROSOFT;
  const redirectUri = provider === 'GOOGLE' ? env.GOOGLE_REDIRECT_URI! : env.MICROSOFT_REDIRECT_URI!;
  const clientId = provider === 'GOOGLE' ? env.GOOGLE_CLIENT_ID! : env.MICROSOFT_CLIENT_ID!;
  const clientSecret = provider === 'GOOGLE' ? env.GOOGLE_CLIENT_SECRET! : env.MICROSOFT_CLIENT_SECRET!;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.error({ provider, status: res.status, text }, '[integrations] Token exchange failed');
    throw ApiError.badRequest(`Failed to exchange authorization code with ${provider}`);
  }
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
  if (!json.refresh_token) {
    // Happens if the user had already granted consent before and Google/Microsoft skips issuing a
    // fresh refresh token — access_type=offline + prompt=consent above is specifically meant to
    // avoid this, but a provider-side inconsistency is still possible.
    throw ApiError.badRequest(`${provider} did not return a refresh token — try disconnecting any prior authorization for this app and reconnecting`);
  }
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresInSeconds: json.expires_in, scope: json.scope };
}

async function fetchAccountEmail(provider: OAuthProvider, accessToken: string): Promise<string> {
  const cfg = provider === 'GOOGLE' ? GOOGLE : MICROSOFT;
  const res = await fetch(cfg.userInfoUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw ApiError.badRequest(`Failed to read account info from ${provider}`);
  const json = (await res.json()) as { email?: string; mail?: string; userPrincipalName?: string };
  const email = provider === 'GOOGLE' ? json.email : json.mail ?? json.userPrincipalName;
  if (!email) throw ApiError.badRequest(`${provider} did not return an account email address`);
  return email;
}

/** Completes the OAuth flow for a provider's callback. Returns the connected email on success. */
export async function completeOAuthCallback(provider: OAuthProvider, code: string, state: string): Promise<{ userId: string; email: string }> {
  const { sub: userId } = verifyState(state, provider);

  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, organizationId: true } });
  if (!user) throw ApiError.badRequest('User no longer exists');

  const tokens = await exchangeCodeForTokens(provider, code);
  const email = await fetchAccountEmail(provider, tokens.accessToken);

  await db
    .insert(emailConnections)
    .values({
      organizationId: user.organizationId,
      userId: user.id,
      provider,
      emailAddress: email,
      accessTokenEnc: encryptToken(tokens.accessToken),
      refreshTokenEnc: encryptToken(tokens.refreshToken),
      tokenExpiresAt: new Date(Date.now() + tokens.expiresInSeconds * 1000),
      scope: tokens.scope ?? null,
    })
    .onConflictDoUpdate({
      target: emailConnections.userId,
      set: {
        provider,
        emailAddress: email,
        accessTokenEnc: encryptToken(tokens.accessToken),
        refreshTokenEnc: encryptToken(tokens.refreshToken),
        tokenExpiresAt: new Date(Date.now() + tokens.expiresInSeconds * 1000),
        scope: tokens.scope ?? null,
        updatedAt: new Date(),
      },
    });

  return { userId: user.id, email };
}

export async function getConnectionStatus(userId: string) {
  const connection = await db.query.emailConnections.findFirst({ where: eq(emailConnections.userId, userId) });
  return {
    google: { configured: googleOAuthEnabled },
    microsoft: { configured: microsoftOAuthEnabled },
    // Never exposes accessTokenEnc/refreshTokenEnc — only what's needed to render the Connected
    // Accounts card (see integrations.controller.ts's getStatus).
    connection: connection
      ? {
          provider: connection.provider,
          emailAddress: connection.emailAddress,
          connectedAt: connection.createdAt,
          // Stage 3: false for a connection made before the calendar scope existed — Settings
          // uses this to prompt a one-time reconnect rather than silently never syncing meetings.
          calendarScopeGranted: hasCalendarScope(connection.provider as OAuthProvider, connection.scope),
        }
      : null,
  };
}

export async function disconnect(userId: string): Promise<void> {
  await db.delete(emailConnections).where(eq(emailConnections.userId, userId));
}

async function refreshAccessToken(provider: OAuthProvider, refreshToken: string): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const cfg = provider === 'GOOGLE' ? GOOGLE : MICROSOFT;
  const clientId = provider === 'GOOGLE' ? env.GOOGLE_CLIENT_ID! : env.MICROSOFT_CLIENT_ID!;
  const clientSecret = provider === 'GOOGLE' ? env.GOOGLE_CLIENT_SECRET! : env.MICROSOFT_CLIENT_SECRET!;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    ...(provider === 'MICROSOFT' ? { scope: cfg.scope } : {}),
  });
  const res = await fetch(cfg.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.error({ provider, status: res.status, text }, '[integrations] Token refresh failed');
    throw ApiError.badRequest(`${provider} connection has expired — please reconnect`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: json.access_token, expiresInSeconds: json.expires_in };
}

/**
 * Returns a currently-valid access token + provider + email + granted scope for the user's
 * connection, refreshing it first if it's within REFRESH_SKEW_MS of expiring. Returns null if the
 * user has no connection — callers (utils/emailSender.ts) fall back to SMTP in that case rather
 * than treating it as an error; utils/calendarSync.ts additionally checks the returned `scope`
 * with hasCalendarScope() before attempting any calendar call, since a connection existing is not
 * the same as it having calendar access (see this file's own CALENDAR_SCOPE_MARKER comment).
 */
export async function getValidAccessToken(
  userId: string
): Promise<{ provider: OAuthProvider; email: string; accessToken: string; scope: string | null } | null> {
  const connection = await db.query.emailConnections.findFirst({ where: eq(emailConnections.userId, userId) });
  if (!connection) return null;

  const provider = connection.provider as OAuthProvider;
  const needsRefresh = connection.tokenExpiresAt.getTime() - Date.now() < REFRESH_SKEW_MS;
  if (!needsRefresh) {
    return { provider, email: connection.emailAddress, accessToken: decryptToken(connection.accessTokenEnc), scope: connection.scope };
  }

  const refreshToken = decryptToken(connection.refreshTokenEnc);
  const refreshed = await refreshAccessToken(provider, refreshToken);
  await db
    .update(emailConnections)
    .set({
      accessTokenEnc: encryptToken(refreshed.accessToken),
      tokenExpiresAt: new Date(Date.now() + refreshed.expiresInSeconds * 1000),
      updatedAt: new Date(),
    })
    .where(eq(emailConnections.userId, userId));

  return { provider, email: connection.emailAddress, accessToken: refreshed.accessToken, scope: connection.scope };
}

/** Sends a raw email via the provider's own send API, given an already-valid access token. */
export async function sendViaProvider(
  provider: OAuthProvider,
  accessToken: string,
  params: { to: string; subject: string; text: string; html?: string }
): Promise<void> {
  if (provider === 'GOOGLE') {
    const mime = [
      `To: ${params.to}`,
      `Subject: ${params.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      params.html ?? `<p>${params.text}</p>`,
    ].join('\r\n');
    const raw = Buffer.from(mime).toString('base64url');
    const res = await fetch(GOOGLE.sendUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw ApiError.internal(`Gmail send failed: ${text}`);
    }
    return;
  }

  // MICROSOFT
  const res = await fetch(MICROSOFT.sendUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: params.subject,
        body: { contentType: 'HTML', content: params.html ?? `<p>${params.text}</p>` },
        toRecipients: [{ emailAddress: { address: params.to } }],
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw ApiError.internal(`Graph sendMail failed: ${text}`);
  }
}

// ----------------------------------------------------------------------------
// Calendar events — Stage 3. Raw provider calls only, kept here beside sendViaProvider (same
// GOOGLE/MICROSOFT config, same auth-header shape); utils/calendarSync.ts is the thin
// orchestration layer that decides whether a meeting's creator even has calendar access before
// calling any of these — exactly the same split as utils/emailSender.ts wrapping sendViaProvider.
// ----------------------------------------------------------------------------

export interface CalendarEventInput {
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  location?: string | null;
  attendeeEmails: string[];
}

/** Creates an event on the provider's primary calendar. Returns the provider's own event id. */
export async function createCalendarEvent(provider: OAuthProvider, accessToken: string, input: CalendarEventInput): Promise<string> {
  if (provider === 'GOOGLE') {
    const res = await fetch(GOOGLE.calendarEventsUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(googleEventBody(input)),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw ApiError.internal(`Google Calendar event create failed: ${text}`);
    }
    const json = (await res.json()) as { id: string };
    return json.id;
  }

  // MICROSOFT
  const res = await fetch(MICROSOFT.calendarEventsUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(microsoftEventBody(input)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw ApiError.internal(`Graph calendar event create failed: ${text}`);
  }
  const json = (await res.json()) as { id: string };
  return json.id;
}

/** Updates an existing event by its provider-native id (a full replace of the fields we manage). */
export async function updateCalendarEvent(provider: OAuthProvider, accessToken: string, eventId: string, input: CalendarEventInput): Promise<void> {
  const cfg = provider === 'GOOGLE' ? GOOGLE : MICROSOFT;
  const res = await fetch(`${cfg.calendarEventsUrl}/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(provider === 'GOOGLE' ? googleEventBody(input) : microsoftEventBody(input)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw ApiError.internal(`${provider} calendar event update failed: ${text}`);
  }
}

/** Deletes an event by its provider-native id. A 404/410 (already gone on the provider's side —
 * the user may have deleted it themselves from their own calendar) is treated as success, not an
 * error, since the end state either way is "no event out there". */
export async function deleteCalendarEvent(provider: OAuthProvider, accessToken: string, eventId: string): Promise<void> {
  const cfg = provider === 'GOOGLE' ? GOOGLE : MICROSOFT;
  const res = await fetch(`${cfg.calendarEventsUrl}/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text().catch(() => '');
    throw ApiError.internal(`${provider} calendar event delete failed: ${text}`);
  }
}

function googleEventBody(input: CalendarEventInput) {
  return {
    summary: input.title,
    description: input.description ?? undefined,
    location: input.location ?? undefined,
    // RFC3339 with a 'Z' suffix is self-describing as UTC — no separate timeZone field needed.
    start: { dateTime: input.startAt.toISOString() },
    end: { dateTime: input.endAt.toISOString() },
    attendees: input.attendeeEmails.map((email) => ({ email })),
  };
}

function microsoftEventBody(input: CalendarEventInput) {
  // Graph's dateTime is LOCAL to the paired timeZone (never a 'Z'/offset suffix) — "UTC" is one of
  // Graph's own recognized timezone names, so this pairs a bare ISO instant with it directly.
  const toGraphDateTime = (d: Date) => ({ dateTime: d.toISOString().replace('Z', ''), timeZone: 'UTC' });
  return {
    subject: input.title,
    body: { contentType: 'text', content: input.description ?? '' },
    location: input.location ? { displayName: input.location } : undefined,
    start: toGraphDateTime(input.startAt),
    end: toGraphDateTime(input.endAt),
    attendees: input.attendeeEmails.map((email) => ({ emailAddress: { address: email }, type: 'required' })),
  };
}
