import { Router } from 'express';
import { and, count, desc, eq, SQL } from 'drizzle-orm';
import { z } from 'zod';
import { authenticate, requirePermission } from '@/middleware/auth';
import { asyncHandler } from '@/utils/asyncHandler';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { db } from '@/config/db';
import { auditLogs } from '@/db/schema';
import { paginationSchema, paginationMeta, toLimitOffset } from '@/utils/pagination';

export const auditLogsRouter = Router();
auditLogsRouter.use(authenticate, requirePermission(PERMISSIONS.AUDIT_LOGS_VIEW));

const queryVSchema = paginationSchema.extend({
  entityType: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().uuid().optional(),
});

auditLogsRouter.get(
  '/',
  validate(queryVSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, entityType, action, userId } = req.query as any;
    const conditions: SQL[] = [];
    if (entityType) conditions.push(eq(auditLogs.entityType, entityType));
    if (action) conditions.push(eq(auditLogs.action, action));
    if (userId) conditions.push(eq(auditLogs.userId, userId));
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      db.query.auditLogs.findMany({
        where,
        orderBy: desc(auditLogs.createdAt),
        with: { user: { columns: { id: true, firstName: true, lastName: true, email: true } } },
        ...toLimitOffset(page, pageSize),
      }),
      db.select({ value: count() }).from(auditLogs).where(where),
    ]);
    res.json({ success: true, data: rows, meta: paginationMeta(Number(total), page, pageSize) });
  })
);
