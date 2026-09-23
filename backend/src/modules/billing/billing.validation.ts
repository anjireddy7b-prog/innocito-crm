import { z } from 'zod';
import { ALL_PLAN_IDS } from './plans';

// Cast for zod's benefit only — same pattern as connectors.validation.ts's providerIdSchema.
// ALL_PLAN_IDS is a real, non-empty array (Object.keys(PLANS)) at runtime.
export const createCheckoutSessionSchema = z.object({
  planId: z.enum(ALL_PLAN_IDS as [string, ...string[]]),
});
