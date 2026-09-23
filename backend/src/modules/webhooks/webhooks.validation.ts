import { z } from 'zod';
import { ALL_WEBHOOK_EVENTS } from './webhookEvents';

// Cast for zod's benefit only — same pattern as apiKeys.validation.ts's permissionKeySchema.
// ALL_WEBHOOK_EVENTS is a real, non-empty array at runtime.
const webhookEventTypeSchema = z.enum(ALL_WEBHOOK_EVENTS as [string, ...string[]]);

// Phase 11 (API/integrations), slice 2. Unlike an API key (valid with zero permissions — see
// apiKeys.validation.ts), an endpoint subscribed to nothing is never useful, so at least one event
// type is required up front rather than allowed and left to be a silently-do-nothing endpoint.
//
// No SSRF protection (private-IP/DNS-rebinding blocking) on `url` in this slice — deliberately out
// of scope, same kind of explicit narrowing as earlier phases' validation-rules/job-queue
// deferrals; see the Architecture Report's Phase 11 slice 2 section for the tradeoff. `url` still
// has to parse as a real URL and fit the column.
export const createWebhookEndpointSchema = z.object({
  url: z.string().url().max(2048),
  eventTypes: z.array(webhookEventTypeSchema).min(1, 'Select at least one event'),
});

// PATCH only ever toggles the on/off switch — url/secret/eventTypes are immutable once created
// (see db/schema.ts's webhookEndpoints table comment); delete and recreate to change those.
export const updateWebhookEndpointSchema = z.object({
  isActive: z.boolean(),
});
