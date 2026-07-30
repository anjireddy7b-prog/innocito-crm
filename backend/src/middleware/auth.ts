import { NextFunction, Request, Response } from 'express';
import { ApiError } from '@/utils/ApiError';
import { verifyAccessToken, AccessTokenPayload } from '@/utils/tokens';
import { PermissionKey } from '@/utils/permissions';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/** Verifies the JWT access token from the Authorization header. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Missing or malformed Authorization header'));
  }
  const token = header.slice('Bearer '.length);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired access token'));
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
