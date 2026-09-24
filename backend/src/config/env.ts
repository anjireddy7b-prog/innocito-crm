import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  SEED_ADMIN_EMAIL: z.string().email().default('admin@innocito.com'),
  SEED_ADMIN_PASSWORD: z.string().default('ChangeMe!123'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().default(15),
  LOG_LEVEL: z.string().default('info'),

  // Outbound email (optional). When unset, utils/emailer.ts logs instead of sending — every
  // notification call site is already wired to it, so filling these in later is all that's needed
  // to turn on real delivery, no code changes required. SMTP_HOST is the on/off switch.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('Innocito CRM <notifications@innocito.com>'),

  // Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 1 (OAuth
  // connection infrastructure). All optional, same on/off-switch pattern as SMTP_HOST above: a
  // provider's OAuth flow only lights up once its own three vars are all set (see
  // googleOAuthEnabled/microsoftOAuthEnabled below), and SMTP stays the always-available
  // fallback (utils/emailSender.ts) regardless of whether either provider is configured.
  // TOKEN_ENCRYPTION_KEY gates BOTH providers together, since it's what makes storing their
  // tokens safe at all — a base64-encoded 32-byte (256-bit) key for AES-256-GCM (see
  // utils/tokenCrypto.ts). Generate one with: `openssl rand -base64 32`.
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_REDIRECT_URI: z.string().optional(),

  // Phase 9 ("advanced CRM" slice) — sequences, Stage 2 (the engine, on top of Stage 1's
  // connections above). All optional with working defaults — unlike Stage 1, the sequences
  // engine needs no external credentials to run; it only ever sends through utils/emailSender.ts,
  // which already knows how to fall back to SMTP. The send window is a single global window in
  // UTC, not a per-organization timezone — the `organizations` table has no timezone column yet
  // (see its own "intentionally minimal" module comment), so this is a deliberate v1
  // simplification, not an oversight: every org's sequence sends currently respect the same
  // UTC hours, however that maps to any given rep's actual working hours.
  SEQUENCE_SEND_WINDOW_START_HOUR: z.coerce.number().min(0).max(23).default(9),
  SEQUENCE_SEND_WINDOW_END_HOUR: z.coerce.number().min(1).max(24).default(18),
  SEQUENCE_SCHEDULER_INTERVAL_MINUTES: z.coerce.number().min(1).default(5),

  // Phase 11 (API/integrations), slice 2 — outbound webhooks. Same in-process `setInterval`
  // pattern as SEQUENCE_SCHEDULER_INTERVAL_MINUTES above (see webhookScheduler.ts), just on a much
  // shorter cadence in SECONDS rather than minutes: a sequence step is fine landing within a few
  // minutes of its due time, but a webhook is standing in for a near-real-time event notification,
  // so deliveries should go out within seconds of the event, not minutes.
  WEBHOOK_SCHEDULER_INTERVAL_SECONDS: z.coerce.number().min(1).default(15),
  // How long a single delivery attempt waits for the receiving endpoint to respond before giving
  // up and treating it as a failure (subject to the same retry/backoff as any other failure).
  WEBHOOK_DELIVERY_TIMEOUT_MS: z.coerce.number().min(1000).default(10_000),
  // Total attempts (the first try plus every retry) before a delivery is marked FAILED and the
  // scheduler stops retrying it. See webhooks.service.ts's BACKOFF_MINUTES for the schedule
  // between attempts.
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().min(1).default(6),

  // Phase 12 (billing/subscriptions). All optional, same on/off-switch pattern as SMTP_HOST/
  // TOKEN_ENCRYPTION_KEY above — STRIPE_SECRET_KEY is what makes billingEnabled true (see below);
  // without it every org just stays on the FREE plan with billing actions returning a clear
  // "not configured" error instead of a crash. STRIPE_PRO_PRICE_ID/STRIPE_ENTERPRISE_PRICE_ID are
  // the Stripe Price IDs (created in the Stripe Dashboard) that a checkout session for that plan
  // points at — ENTERPRISE can stay unset (a "contact sales" plan with no self-serve checkout).
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRO_PRICE_ID: z.string().optional(),
  STRIPE_ENTERPRISE_PRICE_ID: z.string().optional(),

  // Phase 13 (super admin). Optional, comma-separated list of email addresses to promote to
  // isPlatformAdmin (see db/schema.ts's users.isPlatformAdmin comment) — checked on every boot via
  // utils/platformAdminBackfill.ts, the same "runs on every db:migrate, safe to leave set
  // permanently" pattern as utils/permissionCatalogBackfill.ts. Deliberately NOT a self-service
  // in-app action: granting platform-wide, cross-tenant access is an operator decision made by
  // editing this env var and redeploying, never a button any organization's own Admin can reach.
  PLATFORM_ADMIN_EMAILS: z.string().optional(),

  // Phase 14 (AI). Optional, same on/off-switch pattern as STRIPE_SECRET_KEY above — nothing in
  // utils/aiClient.ts or modules/ai/* is touched unless this is set (see aiEnabled below); without
  // it every AI endpoint returns a clear "not configured" 400 instead of a crash. A single key
  // covers all four Phase 14 capabilities (lead insights, email drafting, lead scoring, and the
  // conversational assistant) — they all go through the one lazy client in utils/aiClient.ts.
  ANTHROPIC_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration. See errors above.');
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
// True once real SMTP credentials are configured — see utils/emailer.ts.
export const emailEnabled = !!env.SMTP_HOST;
// True once a real 32-byte encryption key is configured — required before EITHER OAuth
// provider is usable, since it's what makes storing their tokens safe (see utils/tokenCrypto.ts).
export const tokenEncryptionEnabled = !!env.TOKEN_ENCRYPTION_KEY;
// True once Google's OAuth client is fully configured (all three vars) AND encryption is on.
// See modules/integrations/integrations.service.ts.
export const googleOAuthEnabled =
  tokenEncryptionEnabled && !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET && !!env.GOOGLE_REDIRECT_URI;
// True once Microsoft's OAuth app registration is fully configured (all three vars) AND
// encryption is on. See modules/integrations/integrations.service.ts.
export const microsoftOAuthEnabled =
  tokenEncryptionEnabled && !!env.MICROSOFT_CLIENT_ID && !!env.MICROSOFT_CLIENT_SECRET && !!env.MICROSOFT_REDIRECT_URI;
// True once a real Stripe secret key is configured — see utils/stripeClient.ts and
// modules/billing/billing.service.ts. Doesn't require STRIPE_WEBHOOK_SECRET on its own (checkout/
// portal creation don't need it), but the webhook route itself refuses to verify anything without it.
export const billingEnabled = !!env.STRIPE_SECRET_KEY;
// True once a real Anthropic API key is configured — see utils/aiClient.ts and modules/ai/*.
export const aiEnabled = !!env.ANTHROPIC_API_KEY;
