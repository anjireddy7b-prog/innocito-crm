import { NextFunction, Request, Response } from 'express';
import xss from 'xss';

/**
 * Recursively strips dangerous HTML/script content from string fields in
 * the request body, defending against stored/reflected XSS. Combined with
 * Prisma's parameterized queries (SQL-injection protection) and the CSRF
 * double-submit cookie check on state-changing routes (see csrf.ts).
 */
function deepSanitize<T>(value: T): T {
  if (typeof value === 'string') return xss(value) as unknown as T;
  if (Array.isArray(value)) return value.map(deepSanitize) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepSanitize(v);
    }
    return out as T;
  }
  return value;
}

export function sanitizeBody(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    req.body = deepSanitize(req.body);
  }
  next();
}
