import { Router } from 'express';
import { asc } from 'drizzle-orm';
import { authenticate } from '@/middleware/auth';
import { asyncHandler } from '@/utils/asyncHandler';
import { db } from '@/config/db';
import { roles } from '@/db/schema';

export const rolesRouter = Router();

rolesRouter.use(authenticate);

rolesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db.query.roles.findMany({
      with: { permissions: { with: { permission: true } } },
      orderBy: asc(roles.name),
    });
    res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        permissions: r.permissions.map((rp) => rp.permission.key),
      })),
    });
  })
);
