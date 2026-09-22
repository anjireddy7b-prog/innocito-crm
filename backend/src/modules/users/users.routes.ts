import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  listUsersQuerySchema,
} from './users.validation';
import * as controller from './users.controller';

export const usersRouter = Router();

usersRouter.use(authenticate);

// Any authenticated user can see a lightweight assignable-users list (for dropdowns)
usersRouter.get('/assignable', controller.assignable);

// Everything else requires USERS_MANAGE: create accounts, assign roles, reset passwords, and
// enable/disable users. Phase 3: was requireRole('ADMIN') — USERS_MANAGE is granted to ADMIN by
// default (see utils/permissions.ts's ROLE_PERMISSIONS), so this is a zero-behavior-change swap.
usersRouter.use(requirePermission(PERMISSIONS.USERS_MANAGE));

usersRouter.get('/', validate(listUsersQuerySchema, 'query'), controller.list);
usersRouter.get('/:id', controller.getById);
usersRouter.post('/', validate(createUserSchema), controller.create);
usersRouter.patch('/:id', validate(updateUserSchema), controller.update);
usersRouter.patch('/:id/active', controller.setActive);
usersRouter.post('/:id/reset-password', validate(resetPasswordSchema), controller.resetPassword);
