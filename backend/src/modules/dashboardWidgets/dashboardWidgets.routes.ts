import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { pinReportSchema, reorderWidgetsSchema } from './dashboardWidgets.validation';
import * as controller from './dashboardWidgets.controller';

export const dashboardWidgetsRouter = Router();

dashboardWidgetsRouter.use(authenticate);

// Gated on REPORTS_VIEW — the same base permission pinning's underlying report already requires
// to view or run (see reportBuilder.routes.ts). Every route here is otherwise scoped entirely to
// the caller's own userId inside dashboardWidgets.service.ts.
dashboardWidgetsRouter.get('/', requirePermission(PERMISSIONS.REPORTS_VIEW), controller.list);
dashboardWidgetsRouter.post('/', requirePermission(PERMISSIONS.REPORTS_VIEW), validate(pinReportSchema), controller.pin);
dashboardWidgetsRouter.patch('/reorder', requirePermission(PERMISSIONS.REPORTS_VIEW), validate(reorderWidgetsSchema), controller.reorder);
dashboardWidgetsRouter.delete('/:id', requirePermission(PERMISSIONS.REPORTS_VIEW), controller.unpin);
