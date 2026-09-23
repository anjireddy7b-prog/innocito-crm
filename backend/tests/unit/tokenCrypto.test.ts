import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken } from '@/utils/tokenCrypto';

// Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 1. Exercises the
// AES-256-GCM round trip against the fixed TOKEN_ENCRYPTION_KEY vitest.config.ts sets for tests
// (see that file's comment — it's the only Phase-9-sequences env var set globally, since Google/
// Microsoft each need their own three provider vars too before either is "configured").

describe('tokenCrypto', () => {
  it('round-trips a plaintext string through encrypt/decrypt', () => {
    const plaintext = 'ya29.a0AfH6SMB_example_access_token_value';
    const encrypted = encryptToken(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it('produces a different ciphertext for the same plaintext on each call (random IV)', () => {
    const plaintext = 'same-input-both-times';
    const first = encryptToken(plaintext);
    const second = encryptToken(plaintext);
    expect(first).not.toBe(second);
    expect(decryptToken(first)).toBe(plaintext);
    expect(decryptToken(second)).toBe(plaintext);
  });

  it('serializes as three base64 segments joined by dots (iv.authTag.ciphertext)', () => {
    const encrypted = encryptToken('anything');
    expect(encrypted.split('.')).toHaveLength(3);
  });

  it('rejects a tampered ciphertext rather than silently returning corrupted output', () => {
    const encrypted = encryptToken('do-not-tamper-with-me');
    const [iv, authTag, ciphertext] = encrypted.split('.');
    const tampered = [iv, authTag, `${ciphertext.slice(0, -2)}${ciphertext.slice(-2) === 'AA' ? 'BB' : 'AA'}`].join('.');
    expect(() => decryptToken(tampered)).toThrow();
  });

  it('rejects a tampered auth tag', () => {
    const encrypted = encryptToken('another-secret');
    const [iv, authTag, ciphertext] = encrypted.split('.');
    const flippedTag = Buffer.from(authTag, 'base64');
    flippedTag[0] ^= 0xff;
    const tampered = [iv, flippedTag.toString('base64'), ciphertext].join('.');
    expect(() => decryptToken(tampered)).toThrow();
  });

  it('rejects a malformed serialized token (wrong segment count)', () => {
    expect(() => decryptToken('only.two')).toThrow();
    expect(() => decryptToken('no-dots-at-all')).toThrow();
  });
});
