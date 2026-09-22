import { Request } from 'express';
import { SQL, and, eq } from 'drizzle-orm';
import { AnyPgColumn } from 'drizzle-orm/pg-core';
import { ApiError } from '@/utils/ApiError';

/**
 * Reads the authenticated caller's organization id. This is set server-side at login/refresh
 * from the user's own `organizationId` column (see modules/auth/auth.service.ts) and carried in
 * the signed access token — it is never accepted from req.body/req.query/req.params, exactly like
 * `role` and `permissions` already aren't. Every tenant-scoped service function must call this to
 * get its scoping value rather than trust anything else on the request.
 */
export function orgId(req: Request): string {
  const id = req.user?.organizationId;
  if (!id) throw ApiError.unauthorized('Missing organization context');
  return id;
}

/**
 * Combines a tenant-scope condition (`orgColumn = orgId`) with any number of additional
 * conditions, filtering out undefined ones. Use this instead of hand-rolling `and(eq(...), ...)`
 * in every service so the tenant guard is never accidentally left out of a query.
 *
 * Example:
 *   const where = withOrg(leads.organizationId, orgId(req), eq(leads.isActive, true), ...extra);
 */
export function withOrg(orgColumn: AnyPgColumn, org: string, ...rest: (SQL | undefined)[]): SQL {
  const conditions = [eq(orgColumn, org), ...rest.filter((c): c is SQL => Boolean(c))];
  return and(...conditions)!;
}
