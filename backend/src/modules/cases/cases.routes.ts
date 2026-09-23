import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { createCaseSchema, updateCaseSchema, listCasesQuerySchema } from './cases.validation';
import * as controller from './cases.controller';

export const casesRouter = Router();
casesRouter.use(authenticate);

// GET is unconditional for any authenticated org member — mirrors companies/contacts (see
// PERMISSIONS.CASES_MANAGE's own comment in utils/permissions.ts for why there's no separate view
// permission). Only create/update/delete require CASES_MANAGE.
casesRouter.get('/', validate(listCasesQuerySchema, 'query'), controller.list);
casesRouter.get('/:id', controller.getById);
casesRouter.post('/', requirePermission(PERMISSIONS.CASES_MANAGE), validate(createCaseSchema), controller.create);
casesRouter.patch('/:id', requirePermission(PERMISSIONS.CASES_MANAGE), validate(updateCaseSchema), controller.update);
casesRouter.delete('/:id', requirePermission(PERMISSIONS.CASES_MANAGE), controller.remove);
