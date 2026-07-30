import { Request } from 'express';
import { and, asc, eq, inArray, lt, SQL } from 'drizzle-orm';
import { db } from '@/config/db';
import { tasks } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { recordActivity } from '@/utils/activityLogger';
import { notifyUser } from '@/utils/notifier';

export async function listTasks(query: { leadId?: string; assignedToId?: string; status?: string; overdue?: boolean }) {
  const conditions: SQL[] = [];
  if (query.leadId) conditions.push(eq(tasks.leadId, query.leadId));
  if (query.assignedToId) conditions.push(eq(tasks.assignedToId, query.assignedToId));
  if (query.status) conditions.push(inArray(tasks.status, query.status.split(',') as any));
  if (query.overdue) {
    conditions.push(lt(tasks.dueDate, new Date()));
    conditions.push(inArray(tasks.status, ['PENDING', 'IN_PROGRESS']));
  }

  return db.query.tasks.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: asc(tasks.dueDate),
    with: {
      assignedTo: { columns: { id: true, firstName: true, lastName: true } },
      lead: { columns: { id: true, leadNumber: true }, with: { company: { columns: { name: true } } } },
    },
  });
}

export async function createTask(req: Request, input: any) {
  const [task] = await db.insert(tasks).values({ ...input, createdById: req.user!.sub }).returning();
  if (task.leadId) {
    await recordActivity({ type: 'TASK_CREATED', description: `Task "${task.title}" created`, leadId: task.leadId, userId: req.user!.sub });
  }
  if (task.assignedToId) {
    await notifyUser({
      userId: task.assignedToId,
      type: 'TASK_DUE',
      title: 'New task assigned',
      message: `You have a new task: "${task.title}"${task.dueDate ? ` due ${task.dueDate.toDateString()}` : ''}.`,
      leadId: task.leadId ?? undefined,
    });
  }
  await recordAudit({ req, action: 'CREATE', entityType: 'Task', entityId: task.id, newValues: task });
  return task;
}

export async function updateTask(req: Request, id: string, input: any) {
  const before = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!before) throw ApiError.notFound('Task not found');

  const data: any = { ...input, updatedAt: new Date() };
  if (input.status === 'COMPLETED' && before.status !== 'COMPLETED') data.completedAt = new Date();

  const [task] = await db.update(tasks).set(data).where(eq(tasks.id, id)).returning();

  if (task.leadId && input.status === 'COMPLETED' && before.status !== 'COMPLETED') {
    await recordActivity({ type: 'TASK_COMPLETED', description: `Task "${task.title}" completed`, leadId: task.leadId, userId: req.user!.sub });
  }
  await recordAudit({ req, action: 'UPDATE', entityType: 'Task', entityId: id, oldValues: before, newValues: task });
  return task;
}

export async function deleteTask(req: Request, id: string) {
  const before = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!before) throw ApiError.notFound('Task not found');
  await db.delete(tasks).where(eq(tasks.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'Task', entityId: id, oldValues: before });
}
