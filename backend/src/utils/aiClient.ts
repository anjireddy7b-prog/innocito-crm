import Anthropic from '@anthropic-ai/sdk';
import { env, aiEnabled } from '@/config/env';

// Phase 14 (AI). A lazily-constructed singleton Anthropic client, mirroring exactly the on/off-
// switch pattern already used for Stripe (utils/stripeClient.ts): nothing here is touched unless
// aiEnabled is true, and every call site in modules/ai/ai.service.ts checks that flag first (via
// requireAi()) before ever reaching this file. There's no real Anthropic account in this sandbox
// — aiEnabled stays false until an operator sets ANTHROPIC_API_KEY — but this is a genuine,
// unmocked SDK client exactly as it would run in production. Tests exercise the "configured" path
// by mocking the `@anthropic-ai/sdk` package itself (see tests/integration/ai.test.ts
// vi.mock('@anthropic-ai/sdk', ...)), never by faking this file.
let client: Anthropic | null = null;

// Pinned to a specific dated snapshot rather than a bare family alias — unlike Stripe's SDK
// (where letting the SDK pick its own default API version is the right call, since Stripe pins
// versions server-side), an Anthropic model id IS the version. Bump this constant deliberately
// when moving to a newer snapshot, rather than silently riding whatever "latest" resolves to.
export const AI_MODEL = 'claude-sonnet-4-5-20250929';

export function getAiClient(): Anthropic {
  if (!aiEnabled || !env.ANTHROPIC_API_KEY) {
    // Defensive — modules/ai/ai.service.ts's requireAi() should always be called first and throw
    // a clear 400 before any caller reaches this. Not a user-facing error.
    throw new Error('AI features are not configured (ANTHROPIC_API_KEY is unset).');
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}
