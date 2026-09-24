import { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { apiKeys } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { verifyAccessToken, AccessTokenPayload, hashToken } from '@/utils/tokens';
import { PermissionKey } from '@/utils/permissions';
import { isIpAllowed } from '@/utils/ipAllowlist';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/**
 * Verifies the caller's identity from either the `X-Api-Key` header (Phase 11, slice 1) or the
 * existing JWT `Authorization: Bearer` header, and populates `req.user` the same way either path
 * — every downstream `requirePermission`/`orgId(req)` call works unmodified regardless of which
 * one authenticated the request. See db/schema.ts's apiKeys table comment for why an API key can
 * only ever authenticate a GET request: this is enforced right here, before any route handler
 * runs, not left to each route to remember.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const apiKeyHeader = req.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.length > 0) {
    return authenticateApiKey(apiKeyHeader, req, next);
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Missing or malformed Authorization header'));
  }
  const token = header.slice('Bearer '.length);
  try {
    req.user = verifyAccessToken(token);
  } catch {
    return next(ApiError.unauthorized('Invalid or expired access token'));
  }
  return enforceIpAllowlist(req, next);
}

// Phase 15 (security hardening) — checked on EVERY authenticated request, not just at login
// (auth.service.ts's login has its own, earlier check for the same reason auth.controller.ts's
// login rejects a suspended organization AFTER verifying the password: this one runs after
// req.user already exists, so it belongs here, not there). An access token issued while on an
// allowed network stays cryptographically valid — JWTs aren't revocable — until it naturally
// expires, so this is what actually stops that token being used from outside the organization's
// configured ranges once it's out in the wild, not just a one-time gate at sign-in. A platform
// admin (db/schema.ts's isPlatformAdmin) is exempt: the platform-admin console exists partly to
// support/operate organizations FROM outside their own network, and this per-organization
// restriction was never meant to reach the one flag that already sits outside every other
// org-scoped rule in this app (see requirePlatformAdmin below, and every function in
// platformAdmin.service.ts).
async function enforceIpAllowlist(req: Request, next: NextFunction) {
  if (req.user!.isPlatformAdmin) return next();
  const allowed = await isIpAllowed(req.user!.organizationId, req.ip);
  if (!allowed) return next(ApiError.forbidden("Your network is not on this organization's allowed list."));
  next();
}

async function authenticateApiKey(rawKey: string, req: Request, next: NextFunction) {
  try {
    const keyHash = hashToken(rawKey);
    const row = await db.query.apiKeys.findFirst({ where: eq(apiKeys.keyHash, keyHash) });
    if (!row || row.revokedAt) {
      return next(ApiError.unauthorized('Invalid or revoked API key'));
    }
    if (req.method !== 'GET') {
      return next(ApiError.forbidden('API keys are read-only in this version — write requests require a user session'));
    }
    req.user = {
      // Never a real users.id — every write path that treats req.user.sub as a foreign key is
      // already unreachable here (the method check above), so this only ever flows into read-time
      // filters, where a synthetic id that matches no row is harmless (see db/schema.ts).
      sub: `api_key:${row.id}`,
      email: '',
      role: 'API_KEY',
      permissions: row.permissions as string[],
      organizationId: row.organizationId,
      // An API key is a tenant-scoped credential (see this table's own schema.ts comment) — it
      // must never carry platform-admin power, which is why this is hardcoded rather than read
      // from anything on the row.
      isPlatformAdmin: false,
    };
    // Fire-and-forget — a failure to record last-used-at should never fail the actual request.
    db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id)).catch(() => {});
    return enforceIpAllowlist(req, next);
  } catch {
    next(ApiError.unauthorized('Invalid API key'));
  }
}

/** Restricts a route to one or more roles. */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}

/** Restricts a route to callers holding a specific permission grant. */
export function requirePermission(...permissions: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    const has = permissions.some((p) => req.user!.permissions.includes(p));
    if (!has) {
      return next(ApiError.forbidden(`Missing required permission: ${permissions.join(' or ')}`));
    }
    next();
  };
}

/**
 * Restricts a route to platform admins (see db/schema.ts's users.isPlatformAdmin comment).
 * Deliberately separate from requirePermission above — this is never satisfied by any
 * PERMISSIONS grant or role, ADMIN included, so an organization's own Admin can never reach a
 * modules/platformAdmin/* route no matter what their role holds.
 */
export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized());
  if (!req.user.isPlatformAdmin) return next(ApiError.forbidden('Platform admin access required'));
  next();
}
