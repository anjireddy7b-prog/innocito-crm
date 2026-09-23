// Phase 11 (API/integrations), slice 2. The fixed catalog of CRM events an outbound webhook
// endpoint can subscribe to — kept as a plain TS object (validated by zod at the API boundary, see
// webhooks.validation.ts), same "growable without a migration" shape as utils/permissions.ts's
// PERMISSIONS. Dot-separated, lowercase strings (`lead.created`) rather than this codebase's usual
// `resource:action` permission-key shape or its UPPER_SNAKE activityTypeEnum values, on purpose:
// this is the one place those strings leave the process and reach an external receiver, so it gets
// its own, deliberately public-API-flavored naming convention (matching Stripe/GitHub-style event
// names) instead of leaking either internal spelling.
export const WEBHOOK_EVENTS = {
  LEAD_CREATED: 'lead.created',
  LEAD_UPDATED: 'lead.updated',
  LEAD_STATUS_CHANGED: 'lead.status_changed',
  LEAD_ASSIGNED: 'lead.assigned',
  LEAD_DELETED: 'lead.deleted',
} as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[keyof typeof WEBHOOK_EVENTS];

export const ALL_WEBHOOK_EVENTS: WebhookEventType[] = Object.values(WEBHOOK_EVENTS);

/** Human-readable label shown in the endpoint-creation checklist, same role as
 * utils/permissions.ts's PERMISSION_DESCRIPTIONS. */
export const WEBHOOK_EVENT_DESCRIPTIONS: Record<WebhookEventType, string> = {
  [WEBHOOK_EVENTS.LEAD_CREATED]: 'A new lead is created',
  [WEBHOOK_EVENTS.LEAD_UPDATED]: 'A lead’s details are edited',
  [WEBHOOK_EVENTS.LEAD_STATUS_CHANGED]: "A lead's pipeline status changes",
  [WEBHOOK_EVENTS.LEAD_ASSIGNED]: 'A lead is assigned or reassigned to an owner/rep',
  [WEBHOOK_EVENTS.LEAD_DELETED]: 'A lead is deleted (deactivated)',
};
