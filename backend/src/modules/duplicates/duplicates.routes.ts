import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { listDuplicatesQuerySchema, mergeDuplicatesSchema } from './duplicates.validation';
import * as controller from './duplicates.controller';

export const duplicatesRouter = Router();

duplicatesRouter.use(authenticate);

// Detection is read-only over data any authenticated user can already list (GET /companies,
// GET /contacts have no extra permission gate either — see companies.routes.ts/contacts.routes.ts)
// so it's open the same way. Merge is gated dynamically inside duplicates.service.ts, since which
// permission applies (COMPANIES_MANAGE vs CONTACTS_MANAGE) depends on the request body's entityType.
duplicatesRouter.get('/', validate(listDuplicatesQuerySchema, 'query'), controller.list);
duplicatesRouter.post('/merge', validate(mergeDuplicatesSchema), controller.merge);
