import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '@/config/env';

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  role: string;
  permissions: string[];
  // The caller's tenant, set server-side at login/refresh from the user's own DB row (never
  // accepted from any client-supplied field) and re-derived on every request from this signed,
  // verified JWT — the same trust model already used for `role`/`permissions` above. Every
  // tenant-scoped query must read it via utils/tenant.ts's orgId(req), not from req.body/query.
  organizationId: string;
  // Phase 13 (super admin) — see db/schema.ts's users.isPlatformAdmin comment. Carried in the
  // token the same way role/permissions are, and re-derived fresh at every login/refresh from the
  // DB row rather than ever being client-settable.
  isPlatformAdmin: boolean;
  // Phase 13 (super admin), slice 2 — user impersonation. Present only on a short-lived token
  // minted by platformAdmin.service.ts's impersonateUser; absent on every ordinary login/refresh
  // token. Identifies which platform admin is "wearing" this identity, so
  // auth.service.ts's endImpersonation can attribute the END audit entry to them (not to the
  // impersonated user, who is the only one who could otherwise be read off this very token) and so
  // requirePlatformAdmin can never be satisfied by an impersonation token — see
  // signImpersonationToken below, which hardcodes isPlatformAdmin: false regardless of the target
  // row, closing off any chaining/escalation path through this field.
  impersonation?: { platformAdminId: string; platformAdminEmail: string };
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as jwt.SignOptions);
}

// Phase 13 (super admin), slice 2. Deliberately a fixed, short, non-env-configurable TTL —
// unlike the ordinary access token above, whose lifetime is an operator-tunable env var — because
// impersonation is a higher-risk capability than a normal session and should not inherit whatever
// lifetime an operator has set for everyday logins. There is also deliberately no refresh token
// for this kind of session (see platformAdmin.service.ts's impersonateUser): when this expires,
// the frontend simply restores the platform admin's own already-held token rather than silently
// minting a new impersonation token.
const IMPERSONATION_TOKEN_TTL = '30m';

export function signImpersonationToken(
  payload: Omit<AccessTokenPayload, 'isPlatformAdmin'> & { impersonation: NonNullable<AccessTokenPayload['impersonation']> }
): string {
  return jwt.sign({ ...payload, isPlatformAdmin: false }, env.JWT_ACCESS_SECRET, {
    expiresIn: IMPERSONATION_TOKEN_TTL,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

// Phase 15 (security hardening) — TOTP-based MFA. Bridges login()'s two steps (password verified,
// then a TOTP/backup code verified) without ever handing out a real, permission-bearing access
// token in between. Deliberately its own signAccessToken-shaped-but-distinct payload — not an
// AccessTokenPayload with a `mfaPending` flag bolted on — so there is no field this token happens
// to share with a real one that a careless downstream check could read (e.g. `organizationId`)
// before noticing it's mid-challenge; `type: 'mfa_challenge'` is checked explicitly by
// verifyMfaChallengeToken below, and this token is never passed to middleware/auth.ts's
// authenticate at all (see auth.routes.ts's mfa/login-verify route, which takes it in the request
// body, not the Authorization header).
export interface MfaChallengeTokenPayload {
  type: 'mfa_challenge';
  sub: string; // user id
}

const MFA_CHALLENGE_TOKEN_TTL = '5m';

export function signMfaChallengeToken(userId: string): string {
  return jwt.sign({ type: 'mfa_challenge', sub: userId } satisfies MfaChallengeTokenPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: MFA_CHALLENGE_TOKEN_TTL,
  } as jwt.SignOptions);
}

/** Throws if `token` isn't a validly-signed, unexpired MFA challenge token — including one that
 * successfully verifies as a JWT but is actually some OTHER kind of token this app signs with the
 * same secret (e.g. a real access token, or an impersonation token), which is exactly what the
 * explicit `type` check below is for. */
export function verifyMfaChallengeToken(token: string): MfaChallengeTokenPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as Partial<MfaChallengeTokenPayload>;
  if (payload.type !== 'mfa_challenge' || typeof payload.sub !== 'string') {
    throw new Error('Not an MFA challenge token');
  }
  return payload as MfaChallengeTokenPayload;
}

export function generateRefreshTokenValue(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshExpiryDate(): Date {
  const match = /^(\d+)([smhd])$/.exec(env.JWT_REFRESH_EXPIRES_IN);
  const amount = match ? Number(match[1]) : 7;
  const unit = match ? match[2] : 'd';
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return new Date(Date.now() + amount * (multipliers[unit] ?? 86_400_000));
}
