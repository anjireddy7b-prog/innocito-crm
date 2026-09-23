import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { createWebhookEndpointSchema, updateWebhookEndpointSchema } from './webhooks.validation';
import * as controller from './webhooks.controller';

export const webhooksRouter = Router();

webhooksRouter.use(authenticate);

// Phase 11 (API/integrations), slice 2. Every route here manages the endpoint itself (or its
// delivery log), so — same reasoning as apiKeys.routes.ts — it's gated on WEBHOOKS_MANAGE
// regardless of method; there's no "viewing needs less than managing" tier to carve out.
webhooksRouter.get('/', requirePermission(PERMISSIONS.WEBHOOKS_MANAGE), controller.list);
webhooksRouter.post('/', requirePermission(PERMISSIONS.WEBHOOKS_MANAGE), validate(createWebhookEndpointSchema), controller.create);
webhooksRouter.patch('/:id', requirePermission(PERMISSIONS.WEBHOOKS_MANAGE), validate(updateWebhookEndpointSchema), controller.toggle);
webhooksRouter.delete('/:id', requirePermission(PERMISSIONS.WEBHOOKS_MANAGE), controller.remove);
webhooksRouter.get('/:id/deliveries', requirePermission(PERMISSIONS.WEBHOOKS_MANAGE), controller.deliveries);
