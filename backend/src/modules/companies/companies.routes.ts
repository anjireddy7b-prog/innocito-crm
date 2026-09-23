import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { spreadsheetUpload } from '@/middleware/spreadsheetUpload';
import { PERMISSIONS } from '@/utils/permissions';
import { upsertCompanySchema, listCompaniesQuerySchema } from './companies.validation';
import * as controller from './companies.controller';

export const companiesRouter = Router();

companiesRouter.use(authenticate);

companiesRouter.get('/', validate(listCompaniesQuerySchema, 'query'), controller.list);
// Phase 9 ("advanced CRM" slice) — import/export & search hardening. Mirrors leads' own
// POST /leads/import (same multer-backed upload, same per-row try/catch result shape) but scoped
// to Companies + an optional Contact per row, gated on COMPANIES_MANAGE alone (which already
// covers creating a Company directly) rather than requiring CONTACTS_MANAGE too — the same
// "one permission for the whole import feature despite touching a second entity as a side effect"
// precedent leads' import already sets (gated only on LEADS_CREATE despite also creating
// companies/contacts/campaigns/meetings).
companiesRouter.post(
  '/import',
  requirePermission(PERMISSIONS.COMPANIES_MANAGE),
  spreadsheetUpload.single('file'),
  controller.importFile
);
companiesRouter.get('/:id', controller.getById);
companiesRouter.post('/', requirePermission(PERMISSIONS.COMPANIES_MANAGE), validate(upsertCompanySchema), controller.create);
companiesRouter.patch('/:id', requirePermission(PERMISSIONS.COMPANIES_MANAGE), validate(upsertCompanySchema.partial()), controller.update);
companiesRouter.delete('/:id', requirePermission(PERMISSIONS.COMPANIES_MANAGE), controller.remove);
