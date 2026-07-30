import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { asyncHandler } from '@/utils/asyncHandler';
import { PERMISSIONS } from '@/utils/permissions';
import { getDashboardSummary } from './dashboard.service';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate, requirePermission(PERMISSIONS.DASHBOARD_VIEW));

dashboardRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await getDashboardSummary() });
  })
);
