import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { upsertCompanySchema, listCompaniesQuerySchema } from './companies.validation';
import * as controller from './companies.controller';

export const companiesRouter = Router();

companiesRouter.use(authenticate);

companiesRouter.get('/', validate(listCompaniesQuerySchema, 'query'), controller.list);
companiesRouter.get('/:id', controller.getById);
companiesRouter.post('/', requirePermission(PERMISSIONS.COMPANIES_MANAGE), validate(upsertCompanySchema), controller.create);
companiesRouter.patch('/:id', requirePermission(PERMISSIONS.COMPANIES_MANAGE), validate(upsertCompanySchema.partial()), controller.update);
companiesRouter.delete('/:id', requirePermission(PERMISSIONS.COMPANIES_MANAGE), controller.remove);
