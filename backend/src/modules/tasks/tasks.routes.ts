import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { createTaskSchema, updateTaskSchema, listTasksQuerySchema } from './tasks.validation';
import * as controller from './tasks.controller';

export const tasksRouter = Router();
tasksRouter.use(authenticate);

tasksRouter.get('/', validate(listTasksQuerySchema, 'query'), controller.list);
tasksRouter.post('/', requirePermission(PERMISSIONS.TASKS_MANAGE), validate(createTaskSchema), controller.create);
tasksRouter.patch('/:id', requirePermission(PERMISSIONS.TASKS_MANAGE), validate(updateTaskSchema), controller.update);
tasksRouter.delete('/:id', requirePermission(PERMISSIONS.TASKS_MANAGE), controller.remove);
