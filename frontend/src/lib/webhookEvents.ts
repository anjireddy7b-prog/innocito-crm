/** Mirrors backend/src/modules/webhooks/webhookEvents.ts — kept in sync manually since this is a
 * small internal app (same convention as lib/permissions.ts). */
export const WEBHOOK_EVENTS = {
  LEAD_CREATED: 'lead.created',
  LEAD_UPDATED: 'lead.updated',
  LEAD_STATUS_CHANGED: 'lead.status_changed',
  LEAD_ASSIGNED: 'lead.assigned',
  LEAD_DELETED: 'lead.deleted',
} as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[keyof typeof WEBHOOK_EVENTS];

export const ALL_WEBHOOK_EVENTS: WebhookEventType[] = Object.values(WEBHOOK_EVENTS);

export const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, string> = {
  [WEBHOOK_EVENTS.LEAD_CREATED]: 'Lead created',
  [WEBHOOK_EVENTS.LEAD_UPDATED]: "Lead details updated",
  [WEBHOOK_EVENTS.LEAD_STATUS_CHANGED]: 'Lead status changed',
  [WEBHOOK_EVENTS.LEAD_ASSIGNED]: 'Lead assigned / reassigned',
  [WEBHOOK_EVENTS.LEAD_DELETED]: 'Lead deleted',
};
