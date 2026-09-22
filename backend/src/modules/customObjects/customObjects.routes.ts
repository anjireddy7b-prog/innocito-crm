import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { paginationSchema } from '@/utils/pagination';
import {
  createCustomObjectDefinitionSchema,
  updateCustomObjectDefinitionSchema,
  createCustomObjectRecordSchema,
  updateCustomObjectRecordSchema,
} from './customObjects.validation';
import * as controller from './customObjects.controller';

export const customObjectsRouter = Router();

customObjectsRouter.use(authenticate);

// Phase 5: everything here — defining object types AND working their records — is gated behind
// a single CUSTOM_OBJECTS_MANAGE permission, ADMIN-only by default. Unlike custom *fields* on
// leads (where every lead viewer needs the field list to render the lead form), custom objects
// are a brand-new surface with no pre-existing "view" audience to carve out yet.
customObjectsRouter.get('/', requirePermission(PERMISSIONS.CUSTOM_OBJECTS_MANAGE), controller.listDefinitions);
customObjectsRouter.post(
  '/',
  requirePermission(PERMISSIONS.CUSTOM_OBJECTS_MANAGE),
  validate(createCustomObjectDefinitionSchema),
  controller.createDefinition
);
customObjectsRouter.get('/:definitionId', requirePermission(PERMISSIONS.CUSTOM_OBJECTS_MANAGE), controller.getDefinitionById);
customObjectsRouter.patch(
  '/:definitionId',
  requirePermission(PERMISSIONS.CUSTOM_OBJECTS_MANAGE),
  validate(updateCustomObjectDefinitionSchema),
  controller.updateDefinition
);
customObjectsRouter.delete('/:definitionId', requirePermission(PERMISSIONS.CUSTOM_OBJECTS_MANAGE), controller.removeDefinition);

customObjectsRouter.get(
  '/:definitionId/records',
  requirePermission(PERMISSIONS.CUSTOM_OBJECTS_MANAGE),
  validate(paginationSchema, 'query'),
  controller.listRecords
);
customObjectsRouter.post(
  '/:definitionId/records',
  requirePermission(PERMISSIONS.CUSTOM_OBJECTS_MANAGE),
  validate(createCustomObjectRecordSchema),
  controller.createRecord
);
customObjectsRouter.get('/:definitionId/records/:recordId', requirePermission(PERMISSIONS.CUSTOM_OBJECTS_MANAGE), controller.getRecordById);
customObjectsRouter.patch(
  '/:definitionId/records/:recordId',
  requirePermission(PERMISSIONS.CUSTOM_OBJECTS_MANAGE),
  validate(updateCustomObjectRecordSchema),
  controller.updateRecord
);
customObjectsRouter.delete('/:definitionId/records/:recordId', requirePermission(PERMISSIONS.CUSTOM_OBJECTS_MANAGE), controller.removeRecord);
