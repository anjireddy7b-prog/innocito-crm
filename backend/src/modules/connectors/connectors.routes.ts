import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { createConnectorInstanceSchema, updateConnectorInstanceSchema } from './connectors.validation';
import * as controller from './connectors.controller';

export const connectorsRouter = Router();

connectorsRouter.use(authenticate);

// Phase 11 (API/integrations), slice 3. Same "every route manages the thing itself, no separate
// view tier" reasoning as apiKeys.routes.ts/webhooks.routes.ts — a connector instance's config
// routinely holds a real external credential, so even listing it (masked or not) sits behind
// CONNECTORS_MANAGE. The provider catalog is static, global reference data with no secrets of its
// own, but it's still gated the same way: it's only useful alongside the create form it powers.
connectorsRouter.get('/providers', requirePermission(PERMISSIONS.CONNECTORS_MANAGE), controller.listProviders);
connectorsRouter.get('/', requirePermission(PERMISSIONS.CONNECTORS_MANAGE), controller.list);
connectorsRouter.post('/', requirePermission(PERMISSIONS.CONNECTORS_MANAGE), validate(createConnectorInstanceSchema), controller.create);
connectorsRouter.patch('/:id', requirePermission(PERMISSIONS.CONNECTORS_MANAGE), validate(updateConnectorInstanceSchema), controller.update);
connectorsRouter.delete('/:id', requirePermission(PERMISSIONS.CONNECTORS_MANAGE), controller.remove);
