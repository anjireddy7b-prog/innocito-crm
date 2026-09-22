import rateLimit from 'express-rate-limit';

/** General API rate limit — generous, protects against runaway clients/scripts. */
export const apiLimiter = rateLimit({
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
