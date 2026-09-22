import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { signupLimiter } from '@/middleware/rateLimiter';
import { PERMISSIONS } from '@/utils/permissions';
import { signupSchema, updateOrganizationSchema } from './organizations.validation';
import * as controller from './organizations.controller';

export const organizationsRouter = Router();

/**
 * Phase 2: self-service organization signup. Deliberately mounted BEFORE the `authenticate`
 * middleware below — a brand-new organization has no existing user to authenticate as, so this
 * is the one route in this module (and one of the few in the whole API, alongside /auth/login and
 * /auth/refresh) that is intentionally public. Rate-limited more aggressively than login (see
 * rateLimiter.ts) since it mints new tenants rather than just checking a password.
 */
organizationsRouter.post('/signup', signupLimiter, validate(signupSchema), controller.signup);

organizationsRouter.use(authenticate);

/**
 * Phase 1 kept this module deliberately minimal — just enough for the frontend (and manual
 * verification) to confirm which organization the current session is scoped to. Phase 2 adds the
 * one thing genuinely needed now that a second real organization exists: letting that org's own
 * Admin rename their organization or change its slug. Creating OTHER organizations, billing/plan,
 * and any platform-admin view across organizations remain out of scope — this route (like /me
 * below it) only ever reads or writes the caller's own organization, never a list of all of them,
 * since nothing in this app is platform-admin-scoped yet.
 */
organizationsRouter.get('/me', controller.getMe);
// Phase 3: was requireRole('ADMIN'); ORGANIZATION_MANAGE is its intended permanent home (see
// utils/permissions.ts) and is granted to ADMIN by default, so this is a zero-behavior-change swap.
organizationsRouter.patch('/me', requirePermission(PERMISSIONS.ORGANIZATION_MANAGE), validate(updateOrganizationSchema), controller.updateMe);
