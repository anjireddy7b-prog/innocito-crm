import { db } from '@/config/db';
import { activities } from '@/db/schema';
import type { activityTypeEnum } from '@/db/schema';

type ActivityType = (typeof activityTypeEnum.enumValues)[number];

interface ActivityParams {
  type: ActivityType;
  description: string;
  leadId?: string;
  companyId?: string;
  contactId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Records an entry in the CRM activity timeline (distinct from the
 * security-focused AuditLog). This powers the "complete activity timeline"
 * shown on a Lead's detail page: creation, assignment, meetings, comments,
 * status changes, file uploads, follow-ups, etc.
 */
export async function recordActivity(params: ActivityParams) {
  const [activity] = await db
    .insert(activities)
    .values({
      type: params.type,
      description: params.description,
      leadId: params.leadId,
      companyId: params.companyId,
      contactId: params.contactId,
      userId: params.userId,
      metadata: params.metadata as any,
    })
    .returning();
  return activity;
}
