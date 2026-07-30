import { Router } from 'express';
import { authenticate, requirePermission, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import {
  createLeadSchema,
  updateLeadSchema,
  assignLeadSchema,
  changeStatusSchema,
  listLeadsQuerySchema,
  bulkAssignSchema,
} from './leads.validation';
import * as controller from './leads.controller';

export const leadsRouter = Router();

leadsRouter.use(authenticate);
leadsRouter.use(requirePermission(PERMISSIONS.LEADS_VIEW));

leadsRouter.get('/', validate(listLeadsQuerySchema, 'query'), controller.list);
leadsRouter.get('/:id', controller.getById);
leadsRouter.post('/', requirePermission(PERMISSIONS.LEADS_CREATE), validate(createLeadSchema), controller.create);
leadsRouter.patch('/:id', validate(updateLeadSchema), controller.update);
leadsRouter.patch('/:id/assign', requirePermission(PERMISSIONS.LEADS_ASSIGN), validate(assignLeadSchema), controller.assign);
leadsRouter.post('/bulk-assign', requirePermission(PERMISSIONS.LEADS_ASSIGN), validate(bulkAssignSchema), controller.bulkAssign);
leadsRouter.patch('/:id/status', validate(changeStatusSchema), controller.changeStatus);
leadsRouter.delete('/:id', requireRole('ADMIN'), controller.remove);
