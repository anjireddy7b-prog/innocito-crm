import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { createApiKeySchema } from './apiKeys.validation';
import * as controller from './apiKeys.controller';

export const apiKeysRouter = Router();

apiKeysRouter.use(authenticate);

// Phase 11 (API/integrations), slice 1. Every route here manages the credential itself, so it's
// gated on API_KEYS_MANAGE regardless of method — unlike dashboardWidgets.routes.ts, there's no
// "viewing needs less than managing" tier to carve out (a key's existence and its granted
// permissions are themselves sensitive, not organization-wide reference data).
apiKeysRouter.get('/', requirePermission(PERMISSIONS.API_KEYS_MANAGE), controller.list);
apiKeysRouter.post('/', requirePermission(PERMISSIONS.API_KEYS_MANAGE), validate(createApiKeySchema), controller.create);
apiKeysRouter.delete('/:id', requirePermission(PERMISSIONS.API_KEYS_MANAGE), controller.revoke);
