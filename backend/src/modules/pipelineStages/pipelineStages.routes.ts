import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { updatePipelineStageSchema } from './pipelineStages.validation';
import * as controller from './pipelineStages.controller';

export const pipelineStagesRouter = Router();

pipelineStagesRouter.use(authenticate);

// Viewing the stage list is gated the same way custom field definitions are — anyone who can see
// leads needs it to render status labels/colors and the Kanban/board view; only editing needs
// PIPELINE_STAGES_MANAGE.
pipelineStagesRouter.get('/', requirePermission(PERMISSIONS.LEADS_VIEW, PERMISSIONS.PIPELINE_STAGES_MANAGE), controller.list);
pipelineStagesRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.PIPELINE_STAGES_MANAGE),
  validate(updatePipelineStageSchema),
  controller.update
);
