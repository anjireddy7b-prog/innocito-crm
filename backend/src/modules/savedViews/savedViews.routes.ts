import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { createSavedViewSchema, updateSavedViewSchema, listSavedViewsQuerySchema } from './savedViews.validation';
import * as controller from './savedViews.controller';

export const savedViewsRouter = Router();

savedViewsRouter.use(authenticate);

// Every route here is gated on LEADS_VIEW (the only entityType today) — mirroring
// customFields.routes.ts's own "viewing needs the base view permission, not a management one"
// precedent. Ownership/shared-management checks beyond that live in savedViews.service.ts, since
// they depend on the specific row (is it mine? is it shared?), not just the caller's role.
savedViewsRouter.get('/', requirePermission(PERMISSIONS.LEADS_VIEW), validate(listSavedViewsQuerySchema, 'query'), controller.list);
savedViewsRouter.get('/:id', requirePermission(PERMISSIONS.LEADS_VIEW), controller.getById);
savedViewsRouter.post('/', requirePermission(PERMISSIONS.LEADS_VIEW), validate(createSavedViewSchema), controller.create);
savedViewsRouter.patch('/:id', requirePermission(PERMISSIONS.LEADS_VIEW), validate(updateSavedViewSchema), controller.update);
savedViewsRouter.delete('/:id', requirePermission(PERMISSIONS.LEADS_VIEW), controller.remove);
