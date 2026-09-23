import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { createCaseCommentSchema, updateCaseCommentSchema } from './caseComments.validation';
import * as controller from './caseComments.controller';

export const caseCommentsRouter = Router();
caseCommentsRouter.use(authenticate);

// Mirrors modules/comments/comments.routes.ts: creating requires CASES_MANAGE (this module's
// single "management" permission — see its comment in utils/permissions.ts); editing/deleting
// your own comment needs no permission at all, and editing/deleting someone else's is checked
// inside the service against COMMENTS_MANAGE_ANY, not gated here.
caseCommentsRouter.get('/', controller.list);
caseCommentsRouter.post('/', requirePermission(PERMISSIONS.CASES_MANAGE), validate(createCaseCommentSchema), controller.create);
caseCommentsRouter.patch('/:id', validate(updateCaseCommentSchema), controller.update);
caseCommentsRouter.delete('/:id', controller.remove);
