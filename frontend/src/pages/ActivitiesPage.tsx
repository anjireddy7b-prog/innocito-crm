import { useNavigate } from 'react-router-dom';
import {
  UserPlus, Pencil, ArrowRightLeft, RefreshCcw, CalendarClock, CalendarCheck, MessageSquare,
  Paperclip, ListPlus, CheckCircle2, PhoneCall, Mail, FileText, Sparkles,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { useActivities } from '@/api/activities';
import { formatDateTime } from '@/lib/utils';
import type { Activity } from '@/types';

type ActivityWithLead = Activity & { lead?: { id: string; leadNumber: number } | null };

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LEAD_CREATED: Sparkles,
  LEAD_UPDATED: Pencil,
  LEAD_ASSIGNED: UserPlus,
  LEAD_REASSIGNED: ArrowRightLeft,
  STATUS_CHANGED: RefreshCcw,
  MEETING_SCHEDULED: CalendarClock,
  MEETING_UPDATED: CalendarClock,
  MEETING_COMPLETED: CalendarCheck,
  COMMENT_ADDED: MessageSquare,
  DOCUMENT_UPLOADED: Paperclip,
  TASK_CREATED: ListPlus,
  TASK_COMPLETED: CheckCircle2,
  FOLLOW_UP_LOGGED: PhoneCall,
  CALL_LOGGED: PhoneCall,
  EMAIL_LOGGED: Mail,
  MOM_ADDED: FileText,
};

export default function ActivitiesPage() {
  const navigate = useNavigate();
  const { data: activities, isLoading } = useActivities({ limit: 100 }) as { data?: ActivityWithLead[]; isLoading: boolean };

  return (
    <div className="space-y-4">
      <PageHeader title="Activities" description="A unified, auto-recorded feed of everything happening across your pipeline." />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      ) : !activities?.length ? (
        <EmptyState title="No activity yet" description="Actions across leads, meetings, tasks, and documents will show up here." />
      ) : (
        <div className="relative space-y-0 pl-2">
          {activities.map((activity, idx) => {
            const Icon = ICONS[activity.type] ?? Sparkles;
            return (
              <div
                key={activity.id}
                className="relative flex cursor-pointer gap-3 rounded-lg pb-6 last:pb-0 hover:bg-muted/40"
                onClick={() => activity.lead && navigate(`/leads/${activity.lead.id}`)}
              >
                {idx < activities.length - 1 && <div className="absolute left-[15px] top-8 h-full w-px bg-border" />}
                <div className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-sm text-foreground">{activity.description}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {activity.user ? `${activity.user.firstName} ${activity.user.lastName} · ` : ''}
                    {formatDateTime(activity.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
