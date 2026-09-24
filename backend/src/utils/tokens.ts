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
