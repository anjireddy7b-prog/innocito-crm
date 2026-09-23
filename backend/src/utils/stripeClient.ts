import Stripe from 'stripe';
import { env, billingEnabled } from '@/config/env';

// Phase 12 (billing/subscriptions). A lazily-constructed singleton Stripe client, mirroring the
// on/off-switch pattern already used for TOKEN_ENCRYPTION_KEY (utils/tokenCrypto.ts) and the two
// OAuth providers (modules/integrations/integrations.service.ts): nothing here is touched unless
// billingEnabled is true, and every call site in billing.service.ts checks that flag first (via
// requireBilling()) before ever reaching this file. There's no real Stripe account in this sandbox
// — billingEnabled stays false until an operator sets STRIPE_SECRET_KEY — but this is a genuine,
// unmocked Stripe SDK client exactly as it would run in production. Tests exercise the
// "configured" path by mocking the `stripe` package itself (see tests/integration/billing.test.ts
// vi.mock('stripe', ...)), never by faking this file, so the real client construction/usage code
// here is exactly what runs once real credentials are supplied.
let client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!billingEnabled || !env.STRIPE_SECRET_KEY) {
    // Defensive — billing.service.ts's requireBilling() should always be called first and throw
    // a clear 400 before any caller reaches this. Not a user-facing error.
    throw new Error('Stripe is not configured (STRIPE_SECRET_KEY is unset).');
  }
  if (!client) {
    // No explicit apiVersion pin: the installed SDK version's own built-in default API version
    // is used, same "let the SDK pick its matching version" approach as not hand-rolling HTTP
    // calls the way integrations.service.ts does for Google/Microsoft (Stripe's SDK, unlike
    // those two REST APIs, is the whole point of taking the dependency at all).
    client = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return client;
}
