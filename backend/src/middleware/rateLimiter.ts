import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { isTest } from '@/config/env';

/**
 * General API rate limit — generous, protects against runaway clients/scripts. Skipped entirely
 * under NODE_ENV=test (Phase 11, slice 1): this single limiter instance is a module-level
 * singleton shared by every `createApp()` call in the process, so its 15-minute window's request
 * count accumulates across the ENTIRE vitest run, not per test file — with `/api/v1` (this phase)
 * now mounting the same router a second time on top of an already-large full-suite request
 * volume, that shared budget was observed to intermittently exhaust mid-run and 429 an unrelated
 * test. No test in this suite asserts on apiLimiter's own throttling behavior (unlike
 * authLimiter/signupLimiter, which organizationsSignupLimits.test.ts and similar deliberately
 * exercise — those stay real in tests), so skipping it here trades nothing away.
 */
export const apiLimiter = isTest
  ? (_req: Request, _res: Response, next: NextFunction) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 600,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message: 'Too many requests, please try again later.' },
    });

/** Tighter limit on auth endpoints to blunt credential-stuffing / brute force. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts, please try again later.' },
});

/**
 * Tighter still, on organization signup specifically. Unlike login (which only ever touches
 * existing rows), an unthrottled signup endpoint lets an attacker mint unlimited organizations +
 * users — a much cheaper and more damaging abuse path than a failed login attempt, so this gets
 * its own, stricter budget rather than sharing authLimiter's.
 */
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many signup attempts from this network, please try again later.' },
});
