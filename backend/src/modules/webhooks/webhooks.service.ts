import { Request } from 'express';
import crypto from 'crypto';
import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import { db } from '@/config/db';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { webhookEndpoints, webhookDeliveries } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { orgId } from '@/utils/tenant';
import { recordAudit } from '@/utils/auditLogger';
import { WebhookEventType } from './webhookEvents';

// Phase 11 (API/integrations), slice 2. See db/schema.ts's webhookEndpoints/webhookDeliveries
// table comments for the full data-model rationale (plaintext secret, isActive vs. apiKeys'
// revokedAt, the delivery table doubling as both retry queue and delivery log).

/** Backoff schedule between retries, indexed by (attempts already made) - 1. A delivery is
 * retried after 1m, then 5m, then 15m, then 1h, then 6h — 5 retries on top of the first attempt,
 * matching WEBHOOK_MAX_ATTEMPTS' default of 6 total attempts. If WEBHOOK_MAX_ATTEMPTS is ever
 * configured higher than this array's length + 1, the last entry is reused for every attempt
 * beyond it rather than throwing. */
const BACKOFF_MINUTES = [1, 5, 15, 60, 360];

function backoffMinutesFor(attemptsMade: number): number {
  const idx = Math.min(attemptsMade - 1, BACKOFF_MINUTES.length - 1);
  return BACKOFF_MINUTES[Math.max(idx, 0)];
}

export async function listWebhookEndpoints(req: Request) {
  const org = orgId(req);
  return db.select().from(webhookEndpoints).where(eq(webhookEndpoints.organizationId, org)).orderBy(desc(webhookEndpoints.createdAt));
}

export async function createWebhookEndpoint(req: Request, url: string, eventTypes: string[]) {
  const org = orgId(req);
  const userId = req.user!.sub;

  const secret = crypto.randomBytes(32).toString('hex');

  const [created] = await db
    .insert(webhookEndpoints)
    .values({ organizationId: org, url, secret, eventTypes, createdById: userId })
    .returning();

  await recordAudit({ req, action: 'CREATE', entityType: 'WebhookEndpoint', entityId: created.id, newValues: { url, eventTypes } });

  return created;
}

/** Toggles isActive only — url/secret/eventTypes are immutable (see webhooks.validation.ts). */
export async function toggleWebhookEndpoint(req: Request, id: string, isActive: boolean) {
  const org = orgId(req);
  const existing = await db.query.webhookEndpoints.findFirst({ where: and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, org)) });
  if (!existing) throw ApiError.notFound('Webhook endpoint not found');

  const [updated] = await db
    .update(webhookEndpoints)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(webhookEndpoints.id, id))
    .returning();

  await recordAudit({
    req,
    action: 'UPDATE',
    entityType: 'WebhookEndpoint',
    entityId: id,
    oldValues: { isActive: existing.isActive },
    newValues: { isActive },
  });

  return updated;
}

export async function deleteWebhookEndpoint(req: Request, id: string) {
  const org = orgId(req);
  const existing = await db.query.webhookEndpoints.findFirst({ where: and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, org)) });
  if (!existing) throw ApiError.notFound('Webhook endpoint not found');

  // Hard delete, unlike apiKeys' soft-revoke — an endpoint has no "audit trail of who used it"
  // worth preserving the way a credential does; its delivery log (dropped via the FK's ON DELETE
  // CASCADE — see db/schema.ts) only ever meant anything in the context of this endpoint existing.
  await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'WebhookEndpoint', entityId: id, oldValues: { url: existing.url } });
}

export async function listRecentDeliveries(req: Request, endpointId: string, limit = 20) {
  const org = orgId(req);
  const endpoint = await db.query.webhookEndpoints.findFirst({ where: and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.organizationId, org)) });
  if (!endpoint) throw ApiError.notFound('Webhook endpoint not found');

  return db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookEndpointId, endpointId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}

/**
 * Called from a domain service (currently only leads.service.ts) right alongside its
 * recordActivity/recordAudit calls, at the exact same points in the lead lifecycle. Only ever
 * ENQUEUES — it inserts one PENDING webhook_deliveries row per active, subscribed endpoint and
 * returns immediately; the actual outbound HTTP call happens later, off the request path, in
 * runDueWebhookDeliveries() below (driven by webhookScheduler.ts's interval). This keeps a lead
 * create/update/etc. request's latency completely independent of how slow or unreachable a
 * tenant's own receiving endpoint happens to be.
 *
 * Never throws — same "must not break the primary request" contract as utils/auditLogger.ts's
 * recordAudit, for the same reason: a bug in this function or a transient DB hiccup here is not a
 * good enough reason to fail the lead operation that triggered it.
 */
export async function dispatchWebhookEvent(organizationId: string, eventType: WebhookEventType, payload: Record<string, unknown>) {
  try {
    const endpoints = await db
      .select()
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.organizationId, organizationId), eq(webhookEndpoints.isActive, true)));

    // Filtered in application code, not via a jsonb `@>` query — the per-organization endpoint
    // count is small (a handful at most) and this keeps the query itself trivial to read; revisit
    // with a containment query only if that stops being true.
    const subscribed = endpoints.filter((e) => (e.eventTypes as string[]).includes(eventType));
    if (!subscribed.length) return;

    await db.insert(webhookDeliveries).values(
      subscribed.map((endpoint) => ({
        organizationId,
        webhookEndpointId: endpoint.id,
        eventType,
        payload,
      }))
    );
  } catch (err) {
    logger.error({ err, eventType }, '[webhooks] failed to enqueue delivery');
  }
}

/** One delivery attempt: signs the payload, POSTs it, and updates the row with the outcome —
 * SUCCEEDED, or PENDING-with-a-later-nextAttemptAt / terminal FAILED depending on attempt count. */
async function attemptDelivery(delivery: typeof webhookDeliveries.$inferSelect, endpoint: typeof webhookEndpoints.$inferSelect) {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    id: delivery.id,
    event: delivery.eventType,
    createdAt: delivery.createdAt,
    data: delivery.payload,
  });
  // Stripe-style signed payload: HMAC-SHA256 over `<timestamp>.<body>` (not the body alone), so a
  // receiver can also reject an old, replayed delivery by checking the timestamp itself — the
  // signature alone can't prove freshness.
  const signature = crypto.createHmac('sha256', endpoint.secret).update(`${timestamp}.${body}`).digest('hex');

  const attempts = delivery.attempts + 1;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.WEBHOOK_DELIVERY_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': delivery.eventType,
        'X-Webhook-Delivery': delivery.id,
        'X-Webhook-Signature': `t=${timestamp},v1=${signature}`,
      },
      body,
      signal: controller.signal,
    });

    if (res.ok) {
      await db
        .update(webhookDeliveries)
        .set({ status: 'SUCCEEDED', attempts, lastAttemptAt: new Date(), lastStatusCode: res.status, lastError: null })
        .where(eq(webhookDeliveries.id, delivery.id));
      return;
    }

    await recordFailure(delivery.id, attempts, res.status, `Endpoint responded ${res.status}`);
  } catch (err: any) {
    const message = err?.name === 'AbortError' ? `Timed out after ${env.WEBHOOK_DELIVERY_TIMEOUT_MS}ms` : String(err?.message ?? err);
    await recordFailure(delivery.id, attempts, null, message);
  } finally {
    clearTimeout(timer);
  }
}

async function recordFailure(deliveryId: string, attempts: number, statusCode: number | null, error: string) {
  const isFinal = attempts >= env.WEBHOOK_MAX_ATTEMPTS;
  const nextAttemptAt = isFinal ? undefined : new Date(Date.now() + backoffMinutesFor(attempts) * 60_000);
  await db
    .update(webhookDeliveries)
    .set({
      status: isFinal ? 'FAILED' : 'PENDING',
      attempts,
      lastAttemptAt: new Date(),
      lastStatusCode: statusCode,
      lastError: error.slice(0, 2000),
      ...(nextAttemptAt ? { nextAttemptAt } : {}),
    })
    .where(eq(webhookDeliveries.id, deliveryId));
}

/** Scans for deliveries due now (PENDING and nextAttemptAt <= now) and attempts each in turn.
 * Called by webhookScheduler.ts's interval tick — also called directly by tests, exactly like
 * modules/sequences/sequenceScheduler.ts's runDueSequenceSteps(). Bounded to a batch of 50 per
 * tick so one tenant's backlog can't starve everyone else's — the next tick picks up the rest. */
export async function runDueWebhookDeliveries(batchSize = 50): Promise<{ processed: number }> {
  const due = await db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.status, 'PENDING'), lte(webhookDeliveries.nextAttemptAt, new Date())))
    .limit(batchSize);

  if (!due.length) return { processed: 0 };

  const endpointIds = [...new Set(due.map((d) => d.webhookEndpointId))];
  const endpoints = await db.query.webhookEndpoints.findMany({ where: inArray(webhookEndpoints.id, endpointIds) });
  const endpointById = new Map(endpoints.map((e) => [e.id, e]));

  let processed = 0;
  for (const delivery of due) {
    const endpoint = endpointById.get(delivery.webhookEndpointId);
    // The endpoint was deleted or paused between enqueue and now — nothing to deliver to. Mark it
    // FAILED rather than leaving it PENDING forever with no endpoint left to retry against.
    if (!endpoint || !endpoint.isActive) {
      await db
        .update(webhookDeliveries)
        .set({ status: 'FAILED', lastAttemptAt: new Date(), lastError: 'Endpoint is no longer active' })
        .where(eq(webhookDeliveries.id, delivery.id));
      continue;
    }
    await attemptDelivery(delivery, endpoint);
    processed += 1;
  }
  return { processed };
}
