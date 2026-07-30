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
}

/**
 * Writes an immutable audit trail entry. Called from services after any
 * security-relevant or data-mutating operation (create/update/delete,
 * login, role change, assignment change, status change, export...).
 * Never throws — audit logging failures must not break the primary request.
 */
export async function recordAudit({ req, action, entityType, entityId, oldValues, newValues }: AuditParams) {
  try {
    await db.insert(auditLogs).values({
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
