import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ListTodo } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { TaskStatusBadge } from '@/components/shared/StatusBadge';
import { useTasks, useUpdateTask } from '@/api/tasks';
import { cn, formatDate } from '@/lib/utils';
import type { Task } from '@/types';

type TaskWithLead = Task & { lead?: { id: string; leadNumber: number; company?: { name: string } | null } | null };

const STATUS_FILTERS = ['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED'];

export default function TasksPage() {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const navigate = useNavigate();
  const query = useMemo(() => {
    if (statusFilter === 'ALL') return {};
    if (statusFilter === 'OVERDUE') return { overdue: true };
    return { status: statusFilter };
  }, [statusFilter]);
  const { data: tasks, isLoading } = useTasks(query) as { data?: TaskWithLead[]; isLoading: boolean };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tasks"
        description="Follow-ups and action items across all leads, assigned to your team."
        actions={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => <SelectItem key={s} value={s}>{s === 'ALL' ? 'All Tasks' : s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : !tasks?.length ? (
        <EmptyState icon={ListTodo} title="No tasks found" description="Tasks created from lead detail pages will show up here." />
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => <TaskRow key={t.id} task={t} onOpenLead={() => t.lead && navigate(`/leads/${t.lead.id}`)} />)}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, onOpenLead }: { task: TaskWithLead; onOpenLead: () => void }) {
  const updateTask = useUpdateTask(task.id);
  const isDone = task.status === 'COMPLETED';
  const isOverdue = !isDone && task.dueDate && new Date(task.dueDate) < new Date();

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Checkbox
          checked={isDone}
          onCheckedChange={(checked) => {
            updateTask.mutate(
              { status: checked ? 'COMPLETED' : 'PENDING' },
              { onSuccess: () => toast.success(checked ? 'Task completed' : 'Task reopened') }
            );
          }}
        />
        <div className="flex-1 cursor-pointer" onClick={onOpenLead}>
          <p className={cn('text-sm font-medium', isDone && 'text-muted-foreground line-through')}>{task.title}</p>
          {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {task.lead?.company?.name && <span className="text-muted-foreground">{task.lead.company.name} ·</span>}
            {task.dueDate && <span className={cn('text-muted-foreground', isOverdue && 'font-medium text-destructive')}>Due {formatDate(task.dueDate)}</span>}
            {task.assignedTo && <span className="text-muted-foreground">· {task.assignedTo.firstName} {task.assignedTo.lastName}</span>}
          </div>
        </div>
        <TaskStatusBadge status={isOverdue ? 'OVERDUE' : task.status} />
      </CardContent>
    </Card>
  );
}
