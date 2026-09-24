import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

// Phase 15 (security hardening) — TOTP-based MFA. `code` deliberately accepts more than 6 digits
// unstripped here — it might be a backup code (`XXXX-XXXX`) instead of a TOTP code, and
// utils/mfa.ts's verifyTotpCode/matchBackupCode each independently validate+normalize whichever
// shape it turns out to be, so this schema only guards against outright empty input.
export const mfaLoginVerifySchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().min(1),
});

export const mfaEnableSchema = z.object({
  code: z.string().min(1),
});

export const mfaDisableSchema = z.object({
  password: z.string().min(1),
});
