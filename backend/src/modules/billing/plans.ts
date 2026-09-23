import { env } from '@/config/env';

// Phase 12 (billing/subscriptions). The fixed plan catalog — same "growable without a migration"
// shape as utils/permissions.ts's PERMISSIONS or modules/webhooks/webhookEvents.ts's
// WEBHOOK_EVENTS. `maxUsers`/`maxLeads` of `null` means unlimited; `priceId` of `null` means
// there's no Stripe Price to check out against (FREE needs none; ENTERPRISE is deliberately
// "contact sales," not self-serve, unless STRIPE_ENTERPRISE_PRICE_ID is actually configured).
export interface Plan {
  id: 'FREE' | 'PRO' | 'ENTERPRISE';
  name: string;
  priceId: string | null;
  monthlyPriceUsd: number | null;
  maxUsers: number | null;
  maxLeads: number | null;
}

export const PLANS: Record<string, Plan> = {
  // maxUsers: 10 gives a brand-new self-serve org (which starts with just its 1 signup Admin —
  // see organizations.service.ts's signup()) real headroom to add a small team before hitting a
  // paywall, not a number picked to be stingy.
  FREE: { id: 'FREE', name: 'Free', priceId: null, monthlyPriceUsd: 0, maxUsers: 10, maxLeads: 250 },
  PRO: { id: 'PRO', name: 'Pro', priceId: env.STRIPE_PRO_PRICE_ID ?? null, monthlyPriceUsd: 49, maxUsers: 25, maxLeads: 10_000 },
  ENTERPRISE: { id: 'ENTERPRISE', name: 'Enterprise', priceId: env.STRIPE_ENTERPRISE_PRICE_ID ?? null, monthlyPriceUsd: null, maxUsers: null, maxLeads: null },
};

export const ALL_PLAN_IDS: string[] = Object.keys(PLANS);

export function getPlan(planId: string): Plan {
  return PLANS[planId] ?? PLANS.FREE;
}

/** The Stripe Price ID a subscription item is billed under maps back to exactly one plan — used
 * by the webhook handler (billing.service.ts) to figure out which plan a Stripe subscription
 * update actually represents, without trusting anything the client itself claims. */
export function planForPriceId(priceId: string | null | undefined): Plan {
  if (!priceId) return PLANS.FREE;
  return Object.values(PLANS).find((p) => p.priceId === priceId) ?? PLANS.FREE;
}
