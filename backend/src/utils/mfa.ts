import crypto from 'crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import argon2 from 'argon2';

// Phase 15 (security hardening) — TOTP-based MFA. Self-contained (RFC 6238 time-based codes via
// otplib, no external identity provider) — unlike full SAML/OIDC SSO, which needs a real IdP to
// even test against, this is fully buildable and verifiable in this repo alone. See
// auth.service.ts's setupMfa/enableMfa/disableMfa/verifyMfaChallenge for how these are used.

const ISSUER = 'SDR ReachOut';
const BACKUP_CODE_COUNT = 8;

/** A fresh base32 TOTP secret — never persisted directly (see auth.service.ts's setupMfa, which
 * encrypts it with utils/tokenCrypto.ts before storing it as users.mfaSecretEnc). */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** The otpauth:// URI an authenticator app (Google Authenticator, 1Password, Authy, ...) scans or
 * imports — `email` labels the entry so a user with several accounts in one app can tell them
 * apart. */
export function totpKeyUri(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

/** A data: URL PNG of the QR code for `keyUri`, ready to drop straight into an <img src>. */
export async function totpQrCodeDataUrl(keyUri: string): Promise<string> {
  return QRCode.toDataURL(keyUri);
}

/** True if `code` (the 6-digit string a user typed) is a valid current-window TOTP code for
 * `secret`. otplib's default window already tolerates one step of clock drift either side. */
export function verifyTotpCode(secret: string, code: string): boolean {
  try {
    return authenticator.verify({ token: code.trim(), secret });
  } catch {
    // Malformed input (wrong length, non-numeric, ...) — fail closed rather than throwing, same
    // discipline as utils/ipAllowlist.ts's ipMatchesCidr.
    return false;
  }
}

/** Formats as `XXXX-XXXX` (8 uppercase base32-alphabet characters) purely for readability when a
 * user copies one down — the hyphen carries no meaning and is stripped before hashing/matching. */
function formatBackupCode(raw: string): string {
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

function randomBackupCode(): string {
  // Base32-alphabet (no 0/1/O/I) so a handwritten copy is never ambiguous about which character
  // was meant.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let raw = '';
  for (let i = 0; i < 8; i++) raw += alphabet[bytes[i] % alphabet.length];
  return formatBackupCode(raw);
}

/** Generates BACKUP_CODE_COUNT one-time recovery codes. Returns both the plaintext (shown to the
 * user exactly once by auth.controller.ts's enableMfa response, then never again) and their argon2
 * hashes (what's actually persisted, on users.mfaBackupCodes — see schema.ts's own comment on
 * that column for why hashed rather than encrypted: a backup code is only ever compared, never
 * redisplayed). */
export async function generateBackupCodes(): Promise<{ plaintext: string[]; hashed: { hash: string; usedAt: string | null }[] }> {
  const plaintext = Array.from({ length: BACKUP_CODE_COUNT }, randomBackupCode);
  const hashed = await Promise.all(plaintext.map(async (code) => ({ hash: await argon2.hash(code), usedAt: null as string | null })));
  return { plaintext, hashed };
}

/** Checks `code` against every not-yet-used hash in `codes`, returning the index of the first
 * match (to mark as spent) or -1. Deliberately checks every remaining code rather than
 * short-circuiting on the first hash mismatch pattern — argon2.verify is already constant-time
 * per comparison, and there's no ordering signal to leak across different codes' hashes. */
export async function matchBackupCode(codes: { hash: string; usedAt: string | null }[], code: string): Promise<number> {
  const normalized = code.trim().toUpperCase();
  for (let i = 0; i < codes.length; i++) {
    if (codes[i].usedAt) continue;
    if (await argon2.verify(codes[i].hash, normalized)) return i;
  }
  return -1;
}
