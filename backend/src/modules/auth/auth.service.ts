import argon2 from 'argon2';
import { Request } from 'express';
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { db } from '@/config/db';
import { users, refreshTokens } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshTokenValue,
  hashToken,
  refreshExpiryDate,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
} from '@/utils/tokens';
import { recordAudit } from '@/utils/auditLogger';
import { isIpAllowed } from '@/utils/ipAllowlist';
import { encryptToken, decryptToken } from '@/utils/tokenCrypto';
import { tokenEncryptionEnabled } from '@/config/env';
import { generateTotpSecret, totpKeyUri, totpQrCodeDataUrl, verifyTotpCode, generateBackupCodes, matchBackupCode } from '@/utils/mfa';

// Phase 15 (security hardening) — account-level brute-force lockout, layered on top of
// authLimiter's existing per-IP rate limit (middleware/rateLimiter.ts). See db/schema.ts's
// users.failedLoginAttempts/lockedUntil comment for why this exists alongside that limiter rather
// than instead of it.
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

// Exported so platformAdmin.service.ts's impersonateUser can load the target user with the exact
// same role/permissions shape login() uses below, rather than duplicating this query.
export async function loadUserWithPermissions(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: { role: { with: { permissions: { with: { permission: true } } } }, organization: true },
  });
  if (!user) return null;
  const permissions = user.role.permissions.map((rp) => rp.permission.key);
  return { user, permissions };
}

export async function login(req: Request, email: string, password: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
    with: { role: { with: { permissions: { with: { permission: true } } } }, organization: true },
  });

  if (!user || !user.isActive) {
    await recordAudit({ req, action: 'LOGIN_FAILED', entityType: 'User', entityId: user?.id });
    throw ApiError.unauthorized('Invalid email or password');
  }

  // Checked before the password is even verified: a locked account rejects EVERY attempt,
  // correct password or not, so there's nothing for an attacker to learn from this branch beyond
  // "this account is currently locked" — no different from what they already caused by racking up
  // the failed attempts that got it locked in the first place.
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
    throw ApiError.unauthorized(`Too many failed login attempts. Try again in ${minutesLeft} minute(s).`);
  }

  const validPassword = await argon2.verify(user.passwordHash, password);
  if (!validPassword) {
    const attempts = user.failedLoginAttempts + 1;
    const nowLocked = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;
    await db
      .update(users)
      .set({
        // Locking resets the counter rather than leaving it at MAX — so the account unlocks with
        // a full fresh budget of attempts once lockedUntil passes, instead of being one attempt
        // away from re-locking immediately.
        failedLoginAttempts: nowLocked ? 0 : attempts,
        lockedUntil: nowLocked ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60_000) : null,
      })
      .where(eq(users.id, user.id));
    await recordAudit({
      req,
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user.id,
      organizationId: user.organizationId,
      newValues: { failedLoginAttempts: attempts },
    });
    if (nowLocked) {
      await recordAudit({
        req,
        action: 'ACCOUNT_LOCKED',
        entityType: 'User',
        entityId: user.id,
        organizationId: user.organizationId,
        newValues: { lockedForMinutes: LOCKOUT_DURATION_MINUTES },
      });
      throw ApiError.unauthorized(`Too many failed login attempts. Try again in ${LOCKOUT_DURATION_MINUTES} minute(s).`);
    }
    throw ApiError.unauthorized('Invalid email or password');
  }

  // The password was correct — clear any accumulated failure count/lock. Cheap no-op write when
  // there was nothing to clear, but skipping it entirely when both are already at rest avoids
  // bumping updatedAt-style churn on every single successful login.
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id));
  }

  // Phase 13 (super admin): checked AFTER the password verifies above, not before — so someone
  // who doesn't already know this account's password learns nothing about whether its
  // organization happens to be suspended. A platform admin is exempt: their own home
  // organization (see db/schema.ts's users.isPlatformAdmin comment) is never meant to gate their
  // ability to operate the platform admin console itself.
  if (!user.organization.isActive && !user.isPlatformAdmin) {
    await recordAudit({
      req,
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user.id,
      organizationId: user.organizationId,
      newValues: { reason: 'organization_suspended' },
    });
    throw ApiError.unauthorized('This organization has been suspended. Contact support for help.');
  }

  // Phase 15 (security hardening) — same exemption and same "after the password verifies"
  // ordering as the organization-suspended check just above (a wrong password from a disallowed
  // network still just gets "Invalid email or password", never a hint that the network itself is
  // the problem). This is the one-time gate at sign-in; middleware/auth.ts's authenticate is what
  // keeps enforcing it on every request after, since an access token issued here stays valid from
  // anywhere until it expires.
  if (!user.isPlatformAdmin && !(await isIpAllowed(user.organizationId, req.ip))) {
    await recordAudit({
      req,
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user.id,
      organizationId: user.organizationId,
      newValues: { reason: 'ip_not_allowed' },
    });
    throw ApiError.unauthorized("Your network is not on this organization's allowed list.");
  }

  // Phase 15 (security hardening) — TOTP-based MFA. Checked after every other gate above
  // (lockout, organization-suspended, IP allowlist) has already passed, and — same reasoning as
  // those — the password has already been verified, so there's nothing left for a non-holder of
  // this account's password to learn from this branch. Rather than issuing the real session
  // below, this hands back a short-lived challenge token (utils/tokens.ts's
  // signMfaChallengeToken) that only verifyMfaChallenge can redeem; no refresh_tokens row is
  // created and no LOGIN audit entry is recorded until that actually happens, so an
  // authenticated-but-not-yet-MFA'd request has no session to speak of at all, not merely a
  // client-side flag it could ignore.
  if (user.mfaEnabled) {
    return { mfaRequired: true as const, challengeToken: signMfaChallengeToken(user.id) };
  }

  const permissions = user.role.permissions.map((rp) => rp.permission.key);
  return { mfaRequired: false as const, ...(await issueSession(req, user, permissions)) };
}

// The exact row shape loadUserWithPermissions/login's own query load (same `with` clause) —
// reused here rather than re-declared so this can never silently drift out of sync with either.
type LoginUserRow = NonNullable<Awaited<ReturnType<typeof loadUserWithPermissions>>>['user'];

async function issueSession(req: Request, user: LoginUserRow, permissions: string[]) {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role.name,
    permissions,
    organizationId: user.organizationId,
    isPlatformAdmin: user.isPlatformAdmin,
  });

  const refreshValue = generateRefreshTokenValue();
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: hashToken(refreshValue),
    expiresAt: refreshExpiryDate(),
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  });

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await recordAudit({ req, action: 'LOGIN', entityType: 'User', entityId: user.id, organizationId: user.organizationId });

  // See getCurrentUser's identical exclusion below for why mfaSecretEnc/mfaBackupCodes never
  // leave the server, same as passwordHash.
  const { passwordHash, organization, mfaSecretEnc, mfaBackupCodes, ...safeUser } = user;
  return {
    accessToken,
    refreshToken: refreshValue,
    user: { ...safeUser, permissions, role: user.role.name },
  };
}

export async function refresh(req: Request, refreshTokenValue: string) {
  const tokenHash = hashToken(refreshTokenValue);
  const stored = await db.query.refreshTokens.findFirst({ where: eq(refreshTokens.tokenHash, tokenHash) });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw ApiError.unauthorized('Refresh token is invalid or expired');
  }

  const loaded = await loadUserWithPermissions(stored.userId);
  if (!loaded || !loaded.user.isActive) throw ApiError.unauthorized('User account is inactive');
  // Phase 13 (super admin): a session silently refreshing in the background gets no special
  // message (see login()'s own comment) — it just fails, and the frontend falls back to the
  // login screen, where the clearer message above is what the person actually sees.
  if (!loaded.user.organization.isActive && !loaded.user.isPlatformAdmin) {
    throw ApiError.unauthorized('Organization suspended');
  }

  // Rotate: revoke the old token, issue a new one
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, stored.id));
  const newRefreshValue = generateRefreshTokenValue();
  await db.insert(refreshTokens).values({
    userId: loaded.user.id,
    tokenHash: hashToken(newRefreshValue),
    expiresAt: refreshExpiryDate(),
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  });

  const accessToken = signAccessToken({
    sub: loaded.user.id,
    email: loaded.user.email,
    role: loaded.user.role.name,
    permissions: loaded.permissions,
    organizationId: loaded.user.organizationId,
    isPlatformAdmin: loaded.user.isPlatformAdmin,
  });

  return { accessToken, refreshToken: newRefreshValue };
}

export async function logout(refreshTokenValue: string | undefined) {
  if (!refreshTokenValue) return;
  const tokenHash = hashToken(refreshTokenValue);
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, tokenHash));
}

// Phase 15 (security hardening) — session/device management. refresh_tokens already carried
// userAgent/ipAddress/expiresAt/revokedAt from day one (see db/schema.ts) purely as an audit
// trail; this is the first code to actually read that data back to the user who owns it, so they
// can see every device currently able to act as them and revoke any one they don't recognize —
// without waiting on an admin, and without a full password-change-style "revoke everything"
// hammer (changePassword above still does that, for the "I think my password itself leaked"
// case; this is for "I think I left myself logged in on a shared computer").
//
// One non-obvious row deliberately excluded from all three functions below: the row for the
// CURRENT session's own refresh token isn't just marked with a `current: true` flag for display —
// revokeOtherSessions never revokes it, and revokeSession lets a caller revoke it like any other
// (ending their own current session, which the frontend, having just done so, follows with an
// ordinary logout). currentTokenValue is always the raw cookie value read straight off the
// request, hashed the same way login()/refresh() hash it (hashToken is one-way, so there's no
// other way to recognize "this one" among the stored rows).
export async function listSessions(userId: string, currentTokenValue: string | undefined) {
  const currentHash = currentTokenValue ? hashToken(currentTokenValue) : null;
  const rows = await db.query.refreshTokens.findMany({
    where: and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())),
    orderBy: desc(refreshTokens.createdAt),
  });
  return rows.map((row) => ({
    id: row.id,
    userAgent: row.userAgent,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    current: currentHash !== null && row.tokenHash === currentHash,
  }));
}

export async function revokeSession(req: Request, userId: string, sessionId: string) {
  const [revoked] = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, sessionId), eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
    .returning();
  // Scoped to this caller's own userId in the WHERE clause above (not just the id) — so this can
  // never be used to probe for, or revoke, another user's session by guessing/enumerating ids;
  // a mismatch reads identically to "already gone" either way.
  if (!revoked) throw ApiError.notFound('Session not found');
  await recordAudit({ req, action: 'SESSION_REVOKED', entityType: 'User', entityId: userId, newValues: { sessionId } });
}

export async function revokeOtherSessions(req: Request, userId: string, currentTokenValue: string | undefined) {
  const currentHash = currentTokenValue ? hashToken(currentTokenValue) : null;
  const active = await db.query.refreshTokens.findMany({
    where: and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)),
  });
  const idsToRevoke = active.filter((row) => row.tokenHash !== currentHash).map((row) => row.id);
  if (idsToRevoke.length > 0) {
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(inArray(refreshTokens.id, idsToRevoke));
  }
  await recordAudit({
    req,
    action: 'SESSION_REVOKED',
    entityType: 'User',
    entityId: userId,
    newValues: { scope: 'others', revokedCount: idsToRevoke.length },
  });
  return { revokedCount: idsToRevoke.length };
}

export async function getCurrentUser(userId: string) {
  const loaded = await loadUserWithPermissions(userId);
  if (!loaded) throw ApiError.notFound('User not found');
  // mfaSecretEnc/mfaBackupCodes are excluded same as passwordHash — the frontend only ever needs
  // the boolean mfaEnabled (still present on safeUser) to decide what to render; the encrypted
  // secret and backup-code hashes have no legitimate use client-side and this is the one
  // general-purpose "read my own user row" endpoint every authenticated page calls.
  const { passwordHash, organization, mfaSecretEnc, mfaBackupCodes, ...safeUser } = loaded.user;
  return { ...safeUser, permissions: loaded.permissions, role: loaded.user.role.name };
}

export async function changePassword(req: Request, userId: string, currentPassword: string, newPassword: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw ApiError.notFound('User not found');

  const valid = await argon2.verify(user.passwordHash, currentPassword);
  if (!valid) throw ApiError.badRequest('Current password is incorrect');

  const passwordHash = await argon2.hash(newPassword);
  await db.update(users).set({ passwordHash, mustChangePassword: false }).where(eq(users.id, userId));
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, userId));
  await recordAudit({ req, action: 'PASSWORD_RESET', entityType: 'User', entityId: userId });
}

// Phase 15 (security hardening) — TOTP-based MFA. Self-service only (no ORG-level "require MFA
// for everyone" policy in this slice — same scope boundary as SessionsCard/changePassword above:
// every function here acts on the caller's OWN account, gated by nothing but `authenticate`, not
// a PERMISSIONS key). Full SAML/OIDC SSO (the other half of what was asked for) is deliberately
// NOT attempted here — unlike this, it needs a real external identity provider to configure and
// verify against, and should be scoped as its own follow-up once one is chosen.

function requireEncryptionForMfa() {
  if (!tokenEncryptionEnabled) {
    // Mirrors connectors.service.ts's requireEncryption — same reasoning: the TOTP secret is a
    // real credential (anyone holding it can generate valid codes for this account forever), so
    // it must never be written to mfaSecretEnc unencrypted.
    throw ApiError.badRequest(
      'This server has no TOKEN_ENCRYPTION_KEY configured, so an MFA secret cannot be stored safely. Ask an operator to set TOKEN_ENCRYPTION_KEY before enabling MFA.'
    );
  }
}

/** Step 1 of enabling MFA: generates a fresh secret (overwriting any not-yet-confirmed one from a
 * previous, abandoned setup attempt — see schema.ts's mfaSecretEnc comment), stores it encrypted,
 * and returns everything the frontend needs to render a scannable QR code plus the raw secret as
 * a fallback for manual entry. mfaEnabled is untouched (stays false, or stays true if the user is
 * mid-way through ROTATING an already-enabled secret) until enableMfa below confirms the user can
 * actually produce a valid code from it. */
export async function setupMfa(userId: string, email: string) {
  requireEncryptionForMfa();
  const secret = generateTotpSecret();
  await db.update(users).set({ mfaSecretEnc: encryptToken(secret) }).where(eq(users.id, userId));
  const keyUri = totpKeyUri(email, secret);
  return { secret, qrCodeDataUrl: await totpQrCodeDataUrl(keyUri) };
}

/** Step 2: confirms the code the user's authenticator app just produced from the pending secret,
 * flips mfaEnabled on, and mints a fresh set of backup codes — returned in plaintext exactly this
 * once (see utils/mfa.ts's generateBackupCodes; only the argon2 hashes are persisted). Generating
 * new backup codes here even on a re-confirm (e.g. rotating the secret) rather than trying to
 * "keep" old ones is deliberate: there is no way to show a previously-issued plaintext code again
 * to prove the old set is still what the user has, so the safe assumption is that any codes issued
 * before this moment might not be — mirrors why enabling MFA the first time gets a brand new set
 * rather than an empty one. */
export async function enableMfa(req: Request, userId: string, code: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw ApiError.notFound('User not found');
  if (!user.mfaSecretEnc) {
    throw ApiError.badRequest('Start MFA setup first to get a secret to confirm.');
  }
  const secret = decryptToken(user.mfaSecretEnc);
  if (!verifyTotpCode(secret, code)) {
    throw ApiError.badRequest('That code is incorrect or expired. Check your authenticator app and try again.');
  }

  const { plaintext, hashed } = await generateBackupCodes();
  await db.update(users).set({ mfaEnabled: true, mfaBackupCodes: hashed }).where(eq(users.id, userId));
  await recordAudit({ req, action: 'MFA_ENABLED', entityType: 'User', entityId: userId });
  return { backupCodes: plaintext };
}

/** Re-verifies the caller's password (same "sensitive action" bar as changePassword itself, since
 * turning MFA off is a downgrade in account security) before clearing every MFA field — a partial
 * disable (e.g. mfaEnabled: false but the secret left behind) would let a later bug or bypass
 * silently resurrect it, so all three columns are cleared together. */
export async function disableMfa(req: Request, userId: string, password: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw ApiError.notFound('User not found');
  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) throw ApiError.badRequest('Current password is incorrect');

  await db.update(users).set({ mfaEnabled: false, mfaSecretEnc: null, mfaBackupCodes: null }).where(eq(users.id, userId));
  await recordAudit({ req, action: 'MFA_DISABLED', entityType: 'User', entityId: userId });
}

/** Redeems an MFA challenge token (from login()'s mfaRequired branch) plus a code — either a live
 * TOTP code or one of the user's remaining backup codes — and, on success, completes login exactly
 * like the non-MFA path does: issues a real session via issueSession, which is where the LOGIN
 * audit entry and the refresh_tokens row actually get created (not here, and not at the earlier
 * password step) — a stolen or guessed challenge token with no valid code behind it produces no
 * session and no trace of a completed login. */
export async function verifyMfaChallenge(req: Request, challengeToken: string, code: string) {
  let payload;
  try {
    payload = verifyMfaChallengeToken(challengeToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired MFA challenge — please log in again.');
  }

  const loaded = await loadUserWithPermissions(payload.sub);
  if (!loaded || !loaded.user.isActive || !loaded.user.mfaEnabled || !loaded.user.mfaSecretEnc) {
    throw ApiError.unauthorized('Invalid or expired MFA challenge — please log in again.');
  }
  const { user, permissions } = loaded;

  // Already checked non-null just above (via loaded.user, the same object) — re-asserted here
  // since the destructure above loses TS's narrowing on the new `user` binding.
  const secret = decryptToken(user.mfaSecretEnc!);
  if (verifyTotpCode(secret, code)) {
    return await issueSession(req, user, permissions);
  }

  // Not a valid TOTP code — try it as a backup code before failing outright.
  const codes = user.mfaBackupCodes ?? [];
  const matchIndex = await matchBackupCode(codes, code);
  if (matchIndex === -1) {
    await recordAudit({ req, action: 'LOGIN_FAILED', entityType: 'User', entityId: user.id, organizationId: user.organizationId, newValues: { reason: 'mfa_code_invalid' } });
    throw ApiError.unauthorized('Invalid code. Check your authenticator app, or use one of your backup codes.');
  }

  // Spend the backup code (mark it used, never delete it — see schema.ts's mfaBackupCodes
  // comment) before issuing the session, so a code can never be reused even if something below
  // fails partway.
  const updatedCodes = codes.map((c, i) => (i === matchIndex ? { ...c, usedAt: new Date().toISOString() } : c));
  await db.update(users).set({ mfaBackupCodes: updatedCodes }).where(eq(users.id, user.id));
  return await issueSession(req, user, permissions);
}

// Phase 13 (super admin), slice 2. Called with the CALLER's own req.user, which — because this
// route is only ever reached with an impersonation token (see auth.routes.ts) — is the
// impersonated user, not the platform admin who initiated it. `impersonation` is that token's own
// `impersonation` claim (see utils/tokens.ts's AccessTokenPayload), carrying who to actually
// credit. Nothing to undo server-side: the impersonation token was never backed by a refresh
// token or any DB session row (see platformAdmin.service.ts's impersonateUser), so simply not
// using it again ends it — this call exists purely to leave a clean END entry beside the START
// one, so a review of either the impersonated user's or the platform admin's audit trail shows a
// matched pair with a duration, not just a START that never explains when it stopped.
export async function endImpersonation(
  req: Request,
  impersonatedUserId: string,
  organizationId: string,
  impersonation: { platformAdminId: string; platformAdminEmail: string }
) {
  await recordAudit({
    req,
    action: 'IMPERSONATION_END',
    entityType: 'User',
    entityId: impersonatedUserId,
    organizationId,
    userId: impersonation.platformAdminId,
    newValues: { platformAdminEmail: impersonation.platformAdminEmail },
  });
}

export { verifyAccessToken };
