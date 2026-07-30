import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { PERMISSIONS } from '@/utils/permissions';
import { documentUpload } from './upload.middleware';
import * as controller from './documents.controller';

export const documentsRouter = Router();
documentsRouter.use(authenticate);

documentsRouter.get('/', controller.list);
documentsRouter.post(
  '/',
  requirePermission(PERMISSIONS.DOCUMENTS_UPLOAD),
  documentUpload.single('file'),
  controller.upload
);
documentsRouter.delete('/:id', requirePermission(PERMISSIONS.DOCUMENTS_DELETE), controller.remove);
