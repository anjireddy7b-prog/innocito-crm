import { describe, it, expect } from 'vitest';
import { authenticator } from 'otplib';
import {
  generateTotpSecret,
  totpKeyUri,
  totpQrCodeDataUrl,
  verifyTotpCode,
  generateBackupCodes,
  matchBackupCode,
} from '@/utils/mfa';

// Phase 15 (security hardening) — pure-function/no-DB tests for utils/mfa.ts. The full
// setup->enable->login-with-code flow (including the encrypted-at-rest secret and the DB-backed
// backup codes) is covered in tests/integration/mfa.test.ts against the real test database.

describe('generateTotpSecret / totpKeyUri / totpQrCodeDataUrl', () => {
  it('generates a secret that verifyTotpCode accepts a real code for', () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it('builds an otpauth:// URI carrying the account email and issuer', () => {
    const secret = generateTotpSecret();
    const uri = totpKeyUri('someone@innocito.com', secret);
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain(encodeURIComponent('someone@innocito.com'));
    expect(uri).toContain(encodeURIComponent('SDR ReachOut'));
  });

  it('renders a scannable QR code as a PNG data URL', async () => {
    const uri = totpKeyUri('someone@innocito.com', generateTotpSecret());
    const dataUrl = await totpQrCodeDataUrl(uri);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});

describe('verifyTotpCode', () => {
  it('rejects a wrong code', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, '000000')).toBe(false);
  });

  it('fails closed (false, not throwing) on garbage input', () => {
    expect(verifyTotpCode('not-a-real-secret!!', '000000')).toBe(false);
    expect(verifyTotpCode(generateTotpSecret(), '')).toBe(false);
  });
});

describe('generateBackupCodes / matchBackupCode', () => {
  it('generates 8 unique, hyphenated codes with matching hashes', async () => {
    const { plaintext, hashed } = await generateBackupCodes();
    expect(plaintext).toHaveLength(8);
    expect(hashed).toHaveLength(8);
    expect(new Set(plaintext).size).toBe(8);
    for (const code of plaintext) expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    for (const h of hashed) expect(h.usedAt).toBeNull();
  });

  it('matches a valid, unused code and returns its index', async () => {
    const { plaintext, hashed } = await generateBackupCodes();
    const index = await matchBackupCode(hashed, plaintext[3]);
    expect(index).toBe(3);
  });

  it('matches case-insensitively (a user retyping a code in lowercase)', async () => {
    const { plaintext, hashed } = await generateBackupCodes();
    const index = await matchBackupCode(hashed, plaintext[0].toLowerCase());
    expect(index).toBe(0);
  });

  it('never matches a code already marked used', async () => {
    const { plaintext, hashed } = await generateBackupCodes();
    const spent = hashed.map((c, i) => (i === 2 ? { ...c, usedAt: new Date().toISOString() } : c));
    expect(await matchBackupCode(spent, plaintext[2])).toBe(-1);
  });

  it('returns -1 for an unrecognized code', async () => {
    const { hashed } = await generateBackupCodes();
    expect(await matchBackupCode(hashed, 'ZZZZ-ZZZZ')).toBe(-1);
  });
});
