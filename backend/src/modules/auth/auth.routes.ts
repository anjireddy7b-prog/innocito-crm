import { Router } from 'express';
import { validate } from '@/middleware/validate';
import { authenticate } from '@/middleware/auth';
import { authLimiter } from '@/middleware/rateLimiter';
import { verifyCsrfToken } from '@/middleware/csrf';
import { loginSchema, changePasswordSchema } from './auth.validation';
import * as controller from './auth.controller';

export const authRouter = Router();

authRouter.post('/login', authLimiter, validate(loginSchema), controller.login);
authRouter.post('/refresh', authLimiter, verifyCsrfToken, controller.refresh);
authRouter.post('/logout', verifyCsrfToken, controller.logout);
authRouter.get('/me', authenticate, controller.me);
authRouter.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  controller.changePassword
);
