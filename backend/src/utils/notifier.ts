import { db } from '@/config/db';
import { notifications } from '@/db/schema';
import type { notificationTypeEnum } from '@/db/schema';

type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

interface NotifyParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  leadId?: string;
}

/** Creates an in-app notification for a user (lead assignment, meeting reminder, overdue task, etc.). */
export async function notifyUser(params: NotifyParams) {
  const [notification] = await db
    .insert(notifications)
    .values({
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      leadId: params.leadId,
    })
    .returning();
  return notification;
}
