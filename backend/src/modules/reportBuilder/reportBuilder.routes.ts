import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import {
  createReportDefinitionSchema,
  updateReportDefinitionSchema,
  listReportDefinitionsQuerySchema,
  runReportSchema,
} from './reportBuilder.validation';
import * as controller from './reportBuilder.controller';

export const reportBuilderRouter = Router();

reportBuilderRouter.use(authenticate);

// Every route here is gated on REPORTS_VIEW (the base "can see reports at all" permission,
// mirroring savedViews.routes.ts's own "viewing needs the base view permission, not a management
// one" precedent) — ownership/shared-management checks beyond that live in
// reportBuilder.service.ts, since they depend on the specific row.
reportBuilderRouter.get('/', requirePermission(PERMISSIONS.REPORTS_VIEW), validate(listReportDefinitionsQuerySchema, 'query'), controller.list);
reportBuilderRouter.post('/run', requirePermission(PERMISSIONS.REPORTS_VIEW), validate(runReportSchema), controller.runAdHoc);
reportBuilderRouter.get('/:id', requirePermission(PERMISSIONS.REPORTS_VIEW), controller.getById);
reportBuilderRouter.post('/:id/run', requirePermission(PERMISSIONS.REPORTS_VIEW), controller.runSaved);
reportBuilderRouter.post('/', requirePermission(PERMISSIONS.REPORTS_VIEW), validate(createReportDefinitionSchema), controller.create);
reportBuilderRouter.patch('/:id', requirePermission(PERMISSIONS.REPORTS_VIEW), validate(updateReportDefinitionSchema), controller.update);
reportBuilderRouter.delete('/:id', requirePermission(PERMISSIONS.REPORTS_VIEW), controller.remove);
