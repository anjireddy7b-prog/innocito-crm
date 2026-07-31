import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/utils/asyncHandler';
import { PERMISSIONS } from '@/utils/permissions';
import { dashboardSummaryQuerySchema } from './dashboard.validation';
import { getDashboardSummary } from './dashboard.service';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate, requirePermission(PERMISSIONS.DASHBOARD_VIEW));

dashboardRouter.get(
  '/summary',
  validate(dashboardSummaryQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await getDashboardSummary(req.query as any) });
  })
);
