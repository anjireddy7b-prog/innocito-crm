import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { upsertContactSchema, listContactsQuerySchema } from './contacts.validation';
import * as controller from './contacts.controller';

export const contactsRouter = Router();

contactsRouter.use(authenticate);

contactsRouter.get('/', validate(listContactsQuerySchema, 'query'), controller.list);
contactsRouter.get('/:id', controller.getById);
contactsRouter.post('/', requirePermission(PERMISSIONS.CONTACTS_MANAGE), validate(upsertContactSchema), controller.create);
contactsRouter.patch('/:id', requirePermission(PERMISSIONS.CONTACTS_MANAGE), validate(upsertContactSchema.partial()), controller.update);
contactsRouter.delete('/:id', requirePermission(PERMISSIONS.CONTACTS_MANAGE), controller.remove);
