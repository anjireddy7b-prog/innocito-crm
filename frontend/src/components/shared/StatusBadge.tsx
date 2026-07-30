import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { humanizeEnum } from '@/lib/utils';
import type { LeadStatus, LeadPriority, TaskStatus, MeetingStatus } from '@/types';

const LEAD_STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  CONTACTED: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  QUALIFIED: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  MEETING_SCHEDULED: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  MEETING_DONE: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  DEMO_SCHEDULED: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
  DEMO_DONE: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  PROPOSAL_SENT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  NEGOTIATION: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  ON_HOLD: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  WON: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  LOST: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  DISQUALIFIED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
};

export function LeadStatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  return <Badge className={cn('border-transparent font-medium', LEAD_STATUS_STYLES[status], className)}>{humanizeEnum(status)}</Badge>;
}

const PRIORITY_STYLES: Record<LeadPriority, string> = {
  LOW: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  MEDIUM: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  CRITICAL: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export function PriorityBadge({ priority, className }: { priority: LeadPriority; className?: string }) {
  return <Badge className={cn('border-transparent font-medium', PRIORITY_STYLES[priority], className)}>{humanizeEnum(priority)}</Badge>;
}

const TASK_STATUS_STYLES: Record<TaskStatus, string> = {
  PENDING: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  OVERDUE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  CANCELLED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
};

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return <Badge className={cn('border-transparent font-medium', TASK_STATUS_STYLES[status], className)}>{humanizeEnum(status)}</Badge>;
}

const MEETING_STATUS_STYLES: Record<MeetingStatus, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  NO_SHOW: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  CANCELLED: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  RESCHEDULED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

export function MeetingStatusBadge({ status, className }: { status: MeetingStatus; className?: string }) {
  return <Badge className={cn('border-transparent font-medium', MEETING_STATUS_STYLES[status], className)}>{humanizeEnum(status)}</Badge>;
}
