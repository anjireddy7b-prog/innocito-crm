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

async function loadUserWithPermissions(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: { role: { with: { permissions: { with: { permission: true } } } } },
  });
  if (!user) return null;
  const permissions = user.role.permissions.map((rp) => rp.permission.key);
  return { user, permissions };
}

export async function login(req: Request, email: string, password: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
    with: { role: { with: { permissions: { with: { permission: true } } } } },
  });

  if (!user || !user.isActive) {
    await recordAudit({ req, action: 'LOGIN_FAILED', entityType: 'User', entityId: user?.id });
    throw ApiError.unauthorized('Invalid email or password');
  }

  const validPassword = await argon2.verify(user.passwordHash, password);
  if (!validPassword) {
    await recordAudit({ req, action: 'LOGIN_FAILED', entityType: 'User', entityId: user.id });
    throw ApiError.unauthorized('Invalid email or password');
  }

  const permissions = user.role.permissions.map((rp) => rp.permission.key);
  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role.name, permissions });

  const refreshValue = generateRefreshTokenValue();
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: hashToken(refreshValue),
    expiresAt: refreshExpiryDate(),
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  });

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await recordAudit({ req, action: 'LOGIN', entityType: 'User', entityId: user.id });

  const { passwordHash, ...safeUser } = user;
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
  const { passwordHash, ...safeUser } = loaded.user;
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

export { verifyAccessToken };
