import { Request } from 'express';
import { db } from '@/config/db';
import { auditLogs } from '@/db/schema';
import type { auditActionEnum } from '@/db/schema';

type AuditAction = (typeof auditActionEnum.enumValues)[number];

interface AuditParams {
  req: Request;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  oldValues?: unknown;
  newValues?: unknown;
  // Override for routes that know the relevant tenant before req.user exists — namely
  // login/refresh in auth.service.ts, where the user (and their org) is looked up directly
  // rather than coming from an already-verified access token. Falls back to the authenticated
  // caller's own org otherwise.
  organizationId?: string | null;
}

/**
 * Writes an immutable audit trail entry. Called from services after any
 * security-relevant or data-mutating operation (create/update/delete,
 * login, role change, assignment change, status change, export...).
 * Never throws — audit logging failures must not break the primary request.
 */
export async function recordAudit({ req, action, entityType, entityId, oldValues, newValues, organizationId }: AuditParams) {
  try {
    await db.insert(auditLogs).values({
      // Explicit override (auth.service.ts, where the org is known from a DB lookup before
      // req.user exists) wins; otherwise the signed access token. Pre-auth events with neither
      // (e.g. LOGIN_FAILED against an email with no matching user) have no tenant to attach to
      // yet — organizationId stays null rather than guessing, which is why this column alone is
      // nullable (see db/schema.ts).
      organizationId: organizationId ?? req.user?.organizationId,
      userId: req.user?.sub,
      action,
      entityType,
      entityId,
      oldValues: oldValues === undefined ? undefined : (oldValues as any),
      newValues: newValues === undefined ? undefined : (newValues as any),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to write audit log', err);
  }
}
