import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { upsertCampaignSchema, listCampaignsQuerySchema } from './campaigns.validation';
import * as controller from './campaigns.controller';

export const campaignsRouter = Router();
campaignsRouter.use(authenticate);

campaignsRouter.get('/', validate(listCampaignsQuerySchema, 'query'), controller.list);
campaignsRouter.get('/:id', controller.getById);
campaignsRouter.post('/', requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE), validate(upsertCampaignSchema), controller.create);
campaignsRouter.patch('/:id', requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE), validate(upsertCampaignSchema.partial()), controller.update);
campaignsRouter.delete('/:id', requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE), controller.remove);
