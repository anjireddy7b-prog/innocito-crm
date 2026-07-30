import {
  UserPlus, Pencil, ArrowRightLeft, RefreshCcw, CalendarClock, CalendarCheck, MessageSquare,
  Paperclip, ListPlus, CheckCircle2, PhoneCall, Mail, FileText, Sparkles,
} from 'lucide-react';
import type { Activity } from '@/types';
import { formatDateTime } from '@/lib/utils';
import { EmptyState } from '@/components/shared/EmptyState';

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

export function TimelineTab({ activities }: { activities: Activity[] }) {
  if (!activities.length) {
    return <EmptyState title="No activity yet" description="Actions on this lead will show up here automatically." />;
  }

  return (
    <div className="relative space-y-0 pl-2">
      {activities.map((activity, idx) => {
        const Icon = ICONS[activity.type] ?? Sparkles;
        return (
          <div key={activity.id} className="relative flex gap-3 pb-6 last:pb-0">
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
  );
}
