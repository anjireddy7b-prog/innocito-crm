import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { createRoleSchema, updateRoleSchema } from './roles.validation';
import * as controller from './roles.controller';

export const rolesRouter = Router();

rolesRouter.use(authenticate);

// Phase 3: this list used to be un-permissioned and platform-wide (every authenticated caller saw
// every organization's roles — a cross-tenant leak once roles became tenant-scoped in this same
// phase). It's now scoped to the caller's own organization (see roles.service.ts) and requires
// either ROLES_VIEW (the roles-management screen) or USERS_MANAGE (the user-creation role picker
// needs to see the org's roles too, without needing full roles-management access).
rolesRouter.get('/', requirePermission(PERMISSIONS.ROLES_VIEW, PERMISSIONS.USERS_MANAGE), controller.list);
rolesRouter.get('/:id', requirePermission(PERMISSIONS.ROLES_VIEW, PERMISSIONS.USERS_MANAGE), controller.getById);

rolesRouter.post('/', requirePermission(PERMISSIONS.ROLES_MANAGE), validate(createRoleSchema), controller.create);
rolesRouter.patch('/:id', requirePermission(PERMISSIONS.ROLES_MANAGE), validate(updateRoleSchema), controller.update);
rolesRouter.delete('/:id', requirePermission(PERMISSIONS.ROLES_MANAGE), controller.remove);
