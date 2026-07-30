import { Router } from 'express';
import { authenticate, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
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

// Everything else is Admin-only: only Admins create accounts, assign roles,
// reset passwords, and enable/disable users.
usersRouter.use(requireRole('ADMIN'));

usersRouter.get('/', validate(listUsersQuerySchema, 'query'), controller.list);
usersRouter.get('/:id', controller.getById);
usersRouter.post('/', validate(createUserSchema), controller.create);
usersRouter.patch('/:id', validate(updateUserSchema), controller.update);
usersRouter.patch('/:id/active', controller.setActive);
usersRouter.post('/:id/reset-password', validate(resetPasswordSchema), controller.resetPassword);
