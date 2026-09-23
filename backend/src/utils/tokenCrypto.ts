import crypto from 'crypto';
import { env } from '@/config/env';

// Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 1. Encrypts the
// OAuth access/refresh tokens stored on email_connections (schema.ts) at rest, using AES-256-GCM
// keyed by TOKEN_ENCRYPTION_KEY (a base64-encoded 32-byte key — see config/env.ts's comment on
// that var for how to generate one). GCM is authenticated encryption: a tampered ciphertext fails
// to decrypt rather than silently returning garbage, which matters here since these tokens grant
// mailbox access if ever recovered.
//
// Serialization: `<iv>.<authTag>.<ciphertext>`, each segment base64 — a single string so it fits
// the existing `text` column type on email_connections without a second column per token.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // 96-bit IV is the AES-GCM recommendation (vs. the 128-bit block size).

function getKey(): Buffer {
  if (!env.TOKEN_ENCRYPTION_KEY) {
    // Only reached if a provider's OAuth flow is somehow invoked despite googleOAuthEnabled/
    // microsoftOAuthEnabled being false — those flags already gate this out at the route layer,
    // so this is a defensive error, not a user-facing one.
    throw new Error('TOKEN_ENCRYPTION_KEY is not configured — cannot encrypt/decrypt OAuth tokens.');
  }
  const key = Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (256 bits) — generate one with `openssl rand -base64 32`.');
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptToken(serialized: string): string {
  const parts = serialized.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted token: expected `<iv>.<authTag>.<ciphertext>`.');
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  // Throws (rather than returning corrupted output) if the ciphertext or authTag was tampered
  // with, or decrypted under the wrong key — this is GCM's authentication check firing.
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
