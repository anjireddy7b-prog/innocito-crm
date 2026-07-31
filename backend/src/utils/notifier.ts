import { eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { notifications, users } from '@/db/schema';
import type { notificationTypeEnum } from '@/db/schema';
import { sendEmail } from '@/utils/emailer';

type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

interface NotifyParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  leadId?: string;
}

/**
 * Creates an in-app notification for a user (lead assignment, meeting reminder, overdue task,
 * status change, etc.) and — the single choke point for every notification type this app raises —
 * also emails it. The recipient address is read fresh from `users.email` on every call, never
 * passed in or cached, so it always reflects whatever an Admin has it set to right now (see
 * users.service.ts's updateUser()). Actual delivery only happens once SMTP is configured (see
 * utils/emailer.ts); until then this still records the in-app notification as before.
 */
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

  const recipient = await db.query.users.findFirst({
    where: eq(users.id, params.userId),
    columns: { email: true, isActive: true },
  });
  if (recipient?.isActive && recipient.email) {
    await sendEmail({ to: recipient.email, subject: params.title, text: params.message });
  }

  return notification;
}
