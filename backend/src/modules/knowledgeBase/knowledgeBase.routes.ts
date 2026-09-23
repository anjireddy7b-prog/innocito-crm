import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { createArticleSchema, updateArticleSchema, listArticlesQuerySchema } from './knowledgeBase.validation';
import * as controller from './knowledgeBase.controller';

export const knowledgeBaseRouter = Router();
knowledgeBaseRouter.use(authenticate);

// GET is unconditional for any authenticated org member — same shape as cases/companies/
// contacts — but the service itself hides DRAFT articles from a caller without
// KNOWLEDGE_BASE_MANAGE (see knowledgeBase.service.ts's module comment). Only create/update/
// delete require the permission here.
knowledgeBaseRouter.get('/', validate(listArticlesQuerySchema, 'query'), controller.list);
knowledgeBaseRouter.get('/:id', controller.getById);
knowledgeBaseRouter.post('/', requirePermission(PERMISSIONS.KNOWLEDGE_BASE_MANAGE), validate(createArticleSchema), controller.create);
knowledgeBaseRouter.patch('/:id', requirePermission(PERMISSIONS.KNOWLEDGE_BASE_MANAGE), validate(updateArticleSchema), controller.update);
knowledgeBaseRouter.delete('/:id', requirePermission(PERMISSIONS.KNOWLEDGE_BASE_MANAGE), controller.remove);
