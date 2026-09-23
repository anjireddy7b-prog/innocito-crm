import { z } from 'zod';
import { ALL_PERMISSIONS } from '@/utils/permissions';

// Cast for zod's benefit only — same pattern as roles.validation.ts's own permissionKeySchema.
// ALL_PERMISSIONS is a real, non-empty array at runtime.
const permissionKeySchema = z.enum(ALL_PERMISSIONS as [string, ...string[]]);

// Phase 11 (API/integrations), slice 1. A key with zero permissions is valid (same "not useful
// yet, but not invalid" allowance roles.validation.ts makes) — it just can't call anything until
// edited... except keys are immutable once created (see apiKeys.service.ts), so a zero-permission
// key really can only ever be revoked and replaced. Still simplest to allow it than special-case it.
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(150),
  permissionKeys: z.array(permissionKeySchema).default([]),
});
