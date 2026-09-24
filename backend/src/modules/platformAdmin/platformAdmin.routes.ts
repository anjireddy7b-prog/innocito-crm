import { Router } from 'express';
import { authenticate, requirePlatformAdmin } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { listOrganizationsQuerySchema, setOrganizationActiveSchema } from './platformAdmin.validation';
import * as controller from './platformAdmin.controller';

export const platformAdminRouter = Router();

platformAdminRouter.use(authenticate);
// Phase 13 (super admin), slice 1. Every route here is gated on requirePlatformAdmin, never a
// PERMISSIONS key — see that middleware's own comment for why: no role, ADMIN included, can ever
// satisfy this. There is no finer-grained permission tier within this module (yet) — a platform
// admin either has this flag or doesn't, the same "one flag, no sub-permissions" simplicity as
// every other module's very first slice in this project.
platformAdminRouter.use(requirePlatformAdmin);

platformAdminRouter.get('/organizations', validate(listOrganizationsQuerySchema, 'query'), controller.list);
platformAdminRouter.get('/organizations/:id', controller.getById);
platformAdminRouter.patch('/organizations/:id/active', validate(setOrganizationActiveSchema), controller.setActive);
