import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { createCommentSchema, updateCommentSchema } from './comments.validation';
import * as controller from './comments.controller';

export const commentsRouter = Router();
commentsRouter.use(authenticate);

commentsRouter.get('/', controller.list);
commentsRouter.post('/', requirePermission(PERMISSIONS.COMMENTS_CREATE), validate(createCommentSchema), controller.create);
commentsRouter.patch('/:id', validate(updateCommentSchema), controller.update);
commentsRouter.delete('/:id', controller.remove);
