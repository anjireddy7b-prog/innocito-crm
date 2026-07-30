import { Router } from 'express';
import { and, desc, eq, SQL } from 'drizzle-orm';
import { authenticate } from '@/middleware/auth';
import { asyncHandler } from '@/utils/asyncHandler';
import { db } from '@/config/db';
import { activities } from '@/db/schema';

export const activitiesRouter = Router();
activitiesRouter.use(authenticate);

/** Unified activity feed — filterable by lead/company/contact, or a global recent feed for the Dashboard. */
activitiesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { leadId, companyId, contactId, limit } = req.query as Record<string, string>;
    const conditions: SQL[] = [];
    if (leadId) conditions.push(eq(activities.leadId, leadId));
    if (companyId) conditions.push(eq(activities.companyId, companyId));
    if (contactId) conditions.push(eq(activities.contactId, contactId));

    const rows = await db.query.activities.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: desc(activities.createdAt),
      limit: limit ? Math.min(Number(limit), 200) : 50,
      with: {
        user: { columns: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        lead: { columns: { id: true, leadNumber: true } },
      },
    });
    res.json({ success: true, data: rows });
  })
);
