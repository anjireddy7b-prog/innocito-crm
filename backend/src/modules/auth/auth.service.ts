import argon2 from 'argon2';
import { Request } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { users, refreshTokens } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshTokenValue,
  hashToken,
  refreshExpiryDate,
} from '@/utils/tokens';
import { recordAudit } from '@/utils/auditLogger';

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

  const validPassword = await argon2.verify(user.passwordHash, password);
  if (!validPassword) {
    await recordAudit({ req, action: 'LOGIN_FAILED', entityType: 'User', entityId: user.id, organizationId: user.organizationId });
    throw ApiError.unauthorized('Invalid email or password');
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

  const permissions = user.role.permissions.map((rp) => rp.permission.key);
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

  const { passwordHash, organization, ...safeUser } = user;
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

export async function getCurrentUser(userId: string) {
  const loaded = await loadUserWithPermissions(userId);
  if (!loaded) throw ApiError.notFound('User not found');
  const { passwordHash, organization, ...safeUser } = loaded.user;
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
