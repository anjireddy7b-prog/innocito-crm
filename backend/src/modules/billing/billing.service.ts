import type Stripe from 'stripe';
import { Request } from 'express';
import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { subscriptions, invoices, users, leads, subscriptionStatusEnum } from '@/db/schema';
import { env, billingEnabled } from '@/config/env';
import { ApiError } from '@/utils/ApiError';
import { orgId } from '@/utils/tenant';
import { recordAudit } from '@/utils/auditLogger';
import { getStripeClient } from '@/utils/stripeClient';
import { getPlan, planForPriceId, ALL_PLAN_IDS } from './plans';

// Phase 12 (billing/subscriptions). See plans.ts for the plan catalog and db/schema.ts for the
// subscriptions/invoices tables. Follows the same "real SDK code, gated behind an env-derived
// on/off flag" shape as Phase 9's OAuth providers and Phase 11 slice 3's connectors encryption
// gate — there's no real Stripe account in this sandbox, so every Stripe-touching function here
// checks requireBilling() first and the "not configured" 400 is the only path actually exercised
// end-to-end today. Once STRIPE_SECRET_KEY (and friends) are set on a real deployment, the exact
// same code starts talking to the real Stripe API with zero changes.

function requireBilling() {
  if (!billingEnabled) {
    throw ApiError.badRequest(
      'This server has no STRIPE_SECRET_KEY configured, so billing actions are unavailable. Every organization stays on the FREE plan until an operator configures Stripe.'
    );
  }
}

type SubscriptionStatusValue = (typeof subscriptionStatusEnum.enumValues)[number];

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatusValue {
  switch (status) {
    case 'active':
      return 'ACTIVE';
    case 'trialing':
      return 'TRIALING';
    case 'past_due':
      return 'PAST_DUE';
    case 'canceled':
      return 'CANCELED';
    // incomplete/incomplete_expired/unpaid/paused all mean "not currently a usable paid
    // subscription" — INCOMPLETE is the closest fit in our smaller status enum, and none of them
    // should ever be confused with a genuinely ACTIVE plan.
    default:
      return 'INCOMPLETE';
  }
}

/**
 * Every organization has exactly one subscriptions row, but nothing backfills it at signup time
 * (see db/schema.ts's own comment) — this lazily inserts a FREE-plan row on first lookup instead,
 * the same "no migration backfill needed" approach connectorInstances/webhookEndpoints don't need
 * at all since those tables start empty, but subscriptions must have a row for every existing org
 * from day one. onConflictDoNothing makes two simultaneous first-lookups race-safe.
 */
export async function getOrCreateSubscription(org: string) {
  const existing = await db.query.subscriptions.findFirst({ where: eq(subscriptions.organizationId, org) });
  if (existing) return existing;

  await db.insert(subscriptions).values({ organizationId: org }).onConflictDoNothing({ target: subscriptions.organizationId });
  const created = await db.query.subscriptions.findFirst({ where: eq(subscriptions.organizationId, org) });
  // Unreachable in practice (the insert above either succeeds or a concurrent one already did),
  // but keeps this function's return type non-nullable rather than forcing every caller to guard.
  if (!created) throw ApiError.internal('Failed to initialize subscription record');
  return created;
}

async function getUsage(org: string) {
  const [[{ value: userCount }], [{ value: leadCount }]] = await Promise.all([
    db.select({ value: count() }).from(users).where(and(eq(users.organizationId, org), eq(users.isActive, true))),
    db.select({ value: count() }).from(leads).where(eq(leads.organizationId, org)),
  ]);
  return { userCount: Number(userCount), leadCount: Number(leadCount) };
}

export async function getBillingSummary(req: Request) {
  const org = orgId(req);
  const subscription = await getOrCreateSubscription(org);
  const plan = getPlan(subscription.planId);
  const usage = await getUsage(org);
  return {
    subscription: {
      planId: subscription.planId,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      hasStripeCustomer: !!subscription.stripeCustomerId,
    },
    plan,
    usage: {
      users: { used: usage.userCount, limit: plan.maxUsers },
      leads: { used: usage.leadCount, limit: plan.maxLeads },
    },
    billingEnabled,
  };
}

/** The full plan catalog, for the upgrade/plan-picker UI — mirrors connectors.service.ts's listProviders. */
export function listPlans() {
  return ALL_PLAN_IDS.map((id) => getPlan(id));
}

function firstClientOrigin(): string {
  return env.CLIENT_ORIGIN.split(',')[0].trim();
}

export async function createCheckoutSession(req: Request, planId: string) {
  requireBilling();
  const org = orgId(req);
  const plan = getPlan(planId);
  if (!plan.priceId) {
    // FREE needs no checkout at all; ENTERPRISE is deliberately "contact sales" unless an
    // operator has actually configured STRIPE_ENTERPRISE_PRICE_ID (see plans.ts).
    throw ApiError.badRequest(`${plan.name} has no self-serve checkout — contact sales, or ask an operator to configure its Stripe Price ID.`);
  }

  const stripe = getStripeClient();
  let subscription = await getOrCreateSubscription(org);

  let customerId = subscription.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: req.user!.email,
      metadata: { organizationId: org },
    });
    customerId = customer.id;
    await db.update(subscriptions).set({ stripeCustomerId: customerId, updatedAt: new Date() }).where(eq(subscriptions.organizationId, org));
  }

  const origin = firstClientOrigin();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    // The webhook handler (below) trusts this to know which of OUR organizations a completed
    // checkout belongs to — it's set by us, on our own server, never accepted from the client.
    client_reference_id: org,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    success_url: `${origin}/settings?billing=success`,
    cancel_url: `${origin}/settings?billing=cancelled`,
  });

  await recordAudit({ req, action: 'UPDATE', entityType: 'Subscription', entityId: subscription.id, newValues: { checkoutStartedForPlan: plan.id } });

  return { url: session.url };
}

export async function createPortalSession(req: Request) {
  requireBilling();
  const org = orgId(req);
  const subscription = await getOrCreateSubscription(org);
  if (!subscription.stripeCustomerId) {
    throw ApiError.badRequest('No billing account yet — start a checkout for a paid plan first.');
  }

  const stripe = getStripeClient();
  const portal = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${firstClientOrigin()}/settings`,
  });

  return { url: portal.url };
}

export async function listInvoices(req: Request) {
  const org = orgId(req);
  return db.select().from(invoices).where(eq(invoices.organizationId, org)).orderBy(desc(invoices.createdAt));
}

/** Called from users.service.ts's createUser, before the insert. No-op once billing is enabled
 * only in the sense that FREE (maxUsers set) is the only plan reachable without real Stripe
 * credentials — the check itself always runs, paid or not, same as any other plan. */
export async function enforceUserLimit(org: string) {
  const subscription = await getOrCreateSubscription(org);
  const plan = getPlan(subscription.planId);
  if (plan.maxUsers == null) return; // unlimited
  const [{ value }] = await db.select({ value: count() }).from(users).where(and(eq(users.organizationId, org), eq(users.isActive, true)));
  if (Number(value) >= plan.maxUsers) {
    throw ApiError.paymentRequired(`The ${plan.name} plan is limited to ${plan.maxUsers} users. Upgrade your plan to add more.`);
  }
}

/** Called from leads.service.ts's createLead, before the insert. See enforceUserLimit above. */
export async function enforceLeadLimit(org: string) {
  const subscription = await getOrCreateSubscription(org);
  const plan = getPlan(subscription.planId);
  if (plan.maxLeads == null) return; // unlimited
  const [{ value }] = await db.select({ value: count() }).from(leads).where(eq(leads.organizationId, org));
  if (Number(value) >= plan.maxLeads) {
    throw ApiError.paymentRequired(`The ${plan.name} plan is limited to ${plan.maxLeads} leads. Upgrade your plan to add more.`);
  }
}

// ----------------------------------------------------------------------------
// Stripe webhook handling
// ----------------------------------------------------------------------------
// Registered directly on `app` (see app.ts) at an exact path with express.raw(), BEFORE the
// global express.json() middleware — Stripe's signature check needs the exact raw request bytes,
// not a re-serialized JSON.parse() of them. Every event type we don't act on below is
// intentionally ignored (not an error) — Stripe still expects a 200 for anything we're
// subscribed to, so it stops retrying delivery.

export async function handleStripeWebhook(rawBody: Buffer, signature: string | undefined): Promise<void> {
  requireBilling();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw ApiError.badRequest('STRIPE_WEBHOOK_SECRET is not configured — cannot verify webhook signatures.');
  }
  if (!signature) throw ApiError.badRequest('Missing Stripe-Signature header');

  const stripe = getStripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    throw ApiError.badRequest(`Webhook signature verification failed: ${(err as Error).message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await onSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;
    case 'customer.subscription.deleted':
      await onSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    case 'invoice.paid':
      await onInvoiceEvent(event.data.object as Stripe.Invoice, 'invoice.paid');
      break;
    case 'invoice.payment_failed':
      await onInvoiceEvent(event.data.object as Stripe.Invoice, 'invoice.payment_failed');
      break;
    default:
      break;
  }
}

async function onCheckoutCompleted(session: Stripe.Checkout.Session) {
  const org = session.client_reference_id;
  if (!org) return; // shouldn't happen — we always set this ourselves in createCheckoutSession
  const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  if (!stripeSubscriptionId) return; // not a subscription-mode session (shouldn't happen — we only ever create 'subscription' mode)

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
  await syncSubscriptionFromStripe(org, subscription, customerId);
}

async function onSubscriptionUpdated(subscription: Stripe.Subscription) {
  const org = await findOrgForStripeSubscription(subscription);
  if (!org) return; // an event for a customer/subscription we don't recognize
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  await syncSubscriptionFromStripe(org, subscription, customerId);
}

async function onSubscriptionDeleted(subscription: Stripe.Subscription) {
  const org = await findOrgForStripeSubscription(subscription);
  if (!org) return;
  await db
    .update(subscriptions)
    .set({ planId: 'FREE', status: 'CANCELED', stripeSubscriptionId: null, cancelAtPeriodEnd: false, updatedAt: new Date() })
    .where(eq(subscriptions.organizationId, org));
}

async function findOrgForStripeSubscription(subscription: Stripe.Subscription): Promise<string | null> {
  const byId = await db.query.subscriptions.findFirst({ where: eq(subscriptions.stripeSubscriptionId, subscription.id) });
  if (byId) return byId.organizationId;
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const byCustomer = await db.query.subscriptions.findFirst({ where: eq(subscriptions.stripeCustomerId, customerId) });
  return byCustomer?.organizationId ?? null;
}

async function syncSubscriptionFromStripe(org: string, subscription: Stripe.Subscription, customerId: string | null) {
  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const plan = planForPriceId(priceId);
  // Stripe moved current_period_end from the Subscription object down onto each subscription
  // item in newer API versions — check the item first and fall back to the (possibly absent,
  // hence the `as any`) top-level field so this keeps working across API version drift without
  // pinning an exact apiVersion in stripeClient.ts.
  const periodEndSeconds: number | null | undefined =
    subscription.items.data[0]?.current_period_end ?? (subscription as unknown as { current_period_end?: number }).current_period_end;

  const values = {
    organizationId: org,
    planId: plan.id,
    status: mapStripeStatus(subscription.status),
    stripeCustomerId: customerId ?? undefined,
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: periodEndSeconds ? new Date(periodEndSeconds * 1000) : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    updatedAt: new Date(),
  };

  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({ target: subscriptions.organizationId, set: values });
}

async function onInvoiceEvent(invoice: Stripe.Invoice, eventType: 'invoice.paid' | 'invoice.payment_failed') {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;
  const subscription = await db.query.subscriptions.findFirst({ where: eq(subscriptions.stripeCustomerId, customerId) });
  if (!subscription) return; // an invoice for a customer we don't recognize — nothing to attach it to

  const values = {
    organizationId: subscription.organizationId,
    stripeInvoiceId: invoice.id!,
    amountDueCents: invoice.amount_due,
    amountPaidCents: invoice.amount_paid,
    currency: invoice.currency,
    status: invoice.status ?? 'unknown',
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
    periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
  };

  await db
    .insert(invoices)
    .values(values)
    .onConflictDoUpdate({
      target: invoices.stripeInvoiceId,
      set: {
        amountDueCents: values.amountDueCents,
        amountPaidCents: values.amountPaidCents,
        status: values.status,
        hostedInvoiceUrl: values.hostedInvoiceUrl,
      },
    });

  // A failed payment is the clearest live signal that the subscription itself is now past due —
  // set it eagerly rather than waiting on a separate customer.subscription.updated event, since
  // Stripe doesn't guarantee the order the two arrive in.
  if (eventType === 'invoice.payment_failed') {
    await db.update(subscriptions).set({ status: 'PAST_DUE', updatedAt: new Date() }).where(eq(subscriptions.organizationId, subscription.organizationId));
  }
}
