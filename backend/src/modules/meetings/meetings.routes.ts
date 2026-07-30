import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { createMeetingSchema, updateMeetingSchema, listMeetingsQuerySchema } from './meetings.validation';
import * as controller from './meetings.controller';

export const meetingsRouter = Router();
meetingsRouter.use(authenticate);

meetingsRouter.get('/', validate(listMeetingsQuerySchema, 'query'), controller.list);
meetingsRouter.post('/', requirePermission(PERMISSIONS.MEETINGS_MANAGE), validate(createMeetingSchema), controller.create);
meetingsRouter.patch('/:id', requirePermission(PERMISSIONS.MEETINGS_MANAGE), validate(updateMeetingSchema), controller.update);
meetingsRouter.delete('/:id', requirePermission(PERMISSIONS.MEETINGS_MANAGE), controller.remove);
