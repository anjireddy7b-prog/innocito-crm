import { Router } from 'express';
import { validate } from '@/middleware/validate';
import { authenticate } from '@/middleware/auth';
import { authLimiter } from '@/middleware/rateLimiter';
import { verifyCsrfToken } from '@/middleware/csrf';
import { loginSchema, changePasswordSchema, mfaLoginVerifySchema, mfaEnableSchema, mfaDisableSchema } from './auth.validation';
import * as controller from './auth.controller';

export const authRouter = Router();

authRouter.post('/login', authLimiter, validate(loginSchema), controller.login);
// Phase 15 (security hardening) — TOTP-based MFA. Same authLimiter budget as /login itself (this
// is the other half of a brute-forceable login attempt — a code guess, not a password guess), and
// deliberately NOT behind `authenticate`: the caller doesn't have a real session yet, only the
// short-lived challenge token from /login's mfaRequired response, which this endpoint itself
// verifies (see auth.service.ts's verifyMfaChallenge).
authRouter.post('/mfa/login-verify', authLimiter, validate(mfaLoginVerifySchema), controller.mfaLoginVerify);
authRouter.post('/refresh', authLimiter, verifyCsrfToken, controller.refresh);
authRouter.post('/logout', verifyCsrfToken, controller.logout);
authRouter.get('/me', authenticate, controller.me);
authRouter.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  controller.changePassword
);

// Phase 15 (security hardening) — TOTP-based MFA, self-service management. `authenticate` alone,
// same "no separate permission — it's your own account" reasoning as /sessions below.
authRouter.post('/mfa/setup', authenticate, controller.setupMfa);
authRouter.post('/mfa/enable', authenticate, validate(mfaEnableSchema), controller.enableMfa);
authRouter.post('/mfa/disable', authenticate, validate(mfaDisableSchema), controller.disableMfa);

// Phase 15 (security hardening) — session/device management. `authenticate` alone, same as /me:
// every handler is scoped to req.user.sub (see auth.service.ts), so there's no separate
// permission to gate — a caller can only ever see or revoke their OWN sessions.
authRouter.get('/sessions', authenticate, controller.listSessions);
authRouter.delete('/sessions/:id', authenticate, controller.revokeSession);
authRouter.post('/sessions/revoke-others', authenticate, controller.revokeOtherSessions);

// Phase 13 (super admin), slice 2. `authenticate` alone, never `requirePlatformAdmin` — that
// middleware is never satisfied by an impersonation token by design (see utils/tokens.ts's
// signImpersonationToken), and this route is only ever called WHILE impersonating (the frontend
// still holds the platform admin's own token in memory and needs no elevated route to restore
// it). The controller itself rejects any call whose token lacks an `impersonation` claim.
authRouter.post('/end-impersonation', authenticate, controller.endImpersonation);
