import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { emailConnections, users } from '@/db/schema';
import { env, googleOAuthEnabled, microsoftOAuthEnabled } from '@/config/env';
import { logger } from '@/config/logger';
import { ApiError } from '@/utils/ApiError';
import { encryptToken, decryptToken } from '@/utils/tokenCrypto';

/**
 * Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 1 (OAuth
 * connection infrastructure only; the sequences engine itself is a later, separate slice). A user
 * optionally connects their own Google or Microsoft mailbox; SMTP (utils/emailer.ts) is the
 * always-available fallback both here and in utils/emailSender.ts, which Stage 2 will call.
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
const GOOGLE = {
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
  sendUrl: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
  scope: 'openid email https://www.googleapis.com/auth/gmail.send',
};
const MICROSOFT = {
  authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
  sendUrl: 'https://graph.microsoft.com/v1.0/me/sendMail',
  scope: 'offline_access User.Read Mail.Send',
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
      ? { provider: connection.provider, emailAddress: connection.emailAddress, connectedAt: connection.createdAt }
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
 * Returns a currently-valid access token + provider + email for the user's connection, refreshing
 * it first if it's within REFRESH_SKEW_MS of expiring. Returns null if the user has no connection
 * — callers (utils/emailSender.ts) fall back to SMTP in that case rather than treating it as an
 * error.
 */
export async function getValidAccessToken(userId: string): Promise<{ provider: OAuthProvider; email: string; accessToken: string } | null> {
  const connection = await db.query.emailConnections.findFirst({ where: eq(emailConnections.userId, userId) });
  if (!connection) return null;

  const provider = connection.provider as OAuthProvider;
  const needsRefresh = connection.tokenExpiresAt.getTime() - Date.now() < REFRESH_SKEW_MS;
  if (!needsRefresh) {
    return { provider, email: connection.emailAddress, accessToken: decryptToken(connection.accessTokenEnc) };
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

  return { provider, email: connection.emailAddress, accessToken: refreshed.accessToken };
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
