import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { createIpAllowlistEntrySchema } from './ipAllowlist.validation';
import * as controller from './ipAllowlist.controller';

export const ipAllowlistRouter = Router();

ipAllowlistRouter.use(authenticate);

// Phase 15 (security hardening). Every route here manages the allowlist itself, so it's gated on
// IP_ALLOWLIST_MANAGE regardless of method — same "no separate viewing tier" reasoning as
// apiKeys.routes.ts (an org's own configured ranges are themselves sensitive network-topology
// information, not organization-wide reference data everyone should see).
ipAllowlistRouter.get('/', requirePermission(PERMISSIONS.IP_ALLOWLIST_MANAGE), controller.list);
ipAllowlistRouter.post('/', requirePermission(PERMISSIONS.IP_ALLOWLIST_MANAGE), validate(createIpAllowlistEntrySchema), controller.create);
ipAllowlistRouter.delete('/:id', requirePermission(PERMISSIONS.IP_ALLOWLIST_MANAGE), controller.remove);
