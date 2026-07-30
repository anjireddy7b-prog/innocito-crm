import { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import { ApiError } from '@/utils/ApiError';

/**
 * Double-submit-cookie CSRF protection. Since auth uses a Bearer JWT (not
 * an ambient cookie) for the access token, CSRF risk is already low, but
 * the refresh-token cookie is ambient — so we defend state-changing
 * requests with a token the browser must echo back in a custom header,
 * which a cross-site form/script cannot read due to the Same-Origin Policy.
 */
const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function issueCsrfToken(req: Request, res: Response, next: NextFunction) {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });
  }
  next();
}

export function verifyCsrfToken(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return next(ApiError.forbidden('Invalid or missing CSRF token'));
  }
  next();
}
