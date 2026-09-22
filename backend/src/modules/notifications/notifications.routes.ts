import { Router } from 'express';
import { and, count, desc, eq } from 'drizzle-orm';
import { authenticate } from '@/middleware/auth';
import { asyncHandler } from '@/utils/asyncHandler';
import { db } from '@/config/db';
import { notifications } from '@/db/schema';
import { orgId } from '@/utils/tenant';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const unreadOnly = req.query.unread === 'true';
    // Scoped by both the caller's own user id AND their organization — belt-and-suspenders, since
    // a notification's userId already can't cross tenants once users are org-scoped, but this
    // keeps the guard explicit rather than implicit.
    const conditions = [eq(notifications.organizationId, orgId(req)), eq(notifications.userId, req.user!.sub)];
    if (unreadOnly) conditions.push(eq(notifications.isRead, false));

    const [rows, [{ value: unreadCount }]] = await Promise.all([
      db.query.notifications.findMany({ where: and(...conditions), orderBy: desc(notifications.createdAt), limit: 50 }),
      db
        .select({ value: count() })
        .from(notifications)
        .where(and(eq(notifications.organizationId, orgId(req)), eq(notifications.userId, req.user!.sub), eq(notifications.isRead, false))),
    ]);
    res.json({ success: true, data: rows, meta: { unreadCount: Number(unreadCount) } });
  })
);

notificationsRouter.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const updated = await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.id, req.params.id),
          eq(notifications.organizationId, orgId(req)),
          eq(notifications.userId, req.user!.sub)
        )
      )
      .returning();
    res.json({ success: true, data: { updated: updated.length } });
  })
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.organizationId, orgId(req)), eq(notifications.userId, req.user!.sub), eq(notifications.isRead, false)));
    res.json({ success: true, data: null });
  })
);
