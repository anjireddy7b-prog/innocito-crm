import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { authenticate } from '@/middleware/auth';
import { asyncHandler } from '@/utils/asyncHandler';
import { ApiError } from '@/utils/ApiError';
import { db } from '@/config/db';
import { organizations } from '@/db/schema';
import { orgId } from '@/utils/tenant';

export const organizationsRouter = Router();
organizationsRouter.use(authenticate);

/**
 * Phase 1 keeps this module deliberately minimal — just enough for the frontend (and manual
 * verification) to confirm which organization the current session is scoped to. Organization
 * administration (creating additional organizations, editing settings, billing/plan, etc.) is
 * out of scope here and belongs to later phases per the Architecture Report's Migration Plan;
 * this route is read-only and returns only the caller's own organization, never a list of all
 * organizations, since nothing in this app is platform-admin-scoped yet.
 */
organizationsRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId(req)) });
    if (!org) throw ApiError.notFound('Organization not found');
    res.json({ success: true, data: { id: org.id, name: org.name, slug: org.slug, isActive: org.isActive } });
  })
);
