import { z } from 'zod';
import { isValidCidr } from '@/utils/ipAllowlist';

// Phase 15 (security hardening). isValidCidr is the exact same parser ipMatchesCidr (the
// enforcement path) uses under the hood — see utils/ipAllowlist.ts's own comment for why that
// matters — so nothing can be accepted here that the middleware would then silently fail to
// match.
export const createIpAllowlistEntrySchema = z.object({
  cidr: z.string().trim().refine(isValidCidr, 'Must be an IPv4 address (e.g. 203.0.113.5) or CIDR range (e.g. 203.0.113.0/24)'),
  label: z.string().trim().max(150).optional(),
});
