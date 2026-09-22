import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { createCustomFieldDefinitionSchema, updateCustomFieldDefinitionSchema, listCustomFieldDefinitionsQuerySchema } from './customFields.validation';
import * as controller from './customFields.controller';

export const customFieldsRouter = Router();

customFieldsRouter.use(authenticate);

// Viewing the field list is gated by LEADS_VIEW/LEADS_CREATE, not CUSTOM_FIELDS_MANAGE — every
// caller who can see or create a lead needs this list to render the lead form's custom-fields
// section; only changing the definitions themselves needs the management permission.
customFieldsRouter.get(
  '/',
  requirePermission(PERMISSIONS.LEADS_VIEW, PERMISSIONS.LEADS_CREATE, PERMISSIONS.CUSTOM_FIELDS_MANAGE),
  validate(listCustomFieldDefinitionsQuerySchema, 'query'),
  controller.list
);
customFieldsRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.LEADS_VIEW, PERMISSIONS.LEADS_CREATE, PERMISSIONS.CUSTOM_FIELDS_MANAGE),
  controller.getById
);

customFieldsRouter.post('/', requirePermission(PERMISSIONS.CUSTOM_FIELDS_MANAGE), validate(createCustomFieldDefinitionSchema), controller.create);
customFieldsRouter.patch('/:id', requirePermission(PERMISSIONS.CUSTOM_FIELDS_MANAGE), validate(updateCustomFieldDefinitionSchema), controller.update);
customFieldsRouter.delete('/:id', requirePermission(PERMISSIONS.CUSTOM_FIELDS_MANAGE), controller.remove);
