import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { UserPicker } from '@/components/shared/UserPicker';
import { TaskStatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { useCreateTask, useUpdateTask } from '@/api/tasks';
import { apiErrorMessage } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import type { Task, TaskPriority } from '@/types';

const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.string(),
  assignedToId: z.string().nullable().optional(),
});
type FormValues = z.infer<typeof schema>;

export function TasksTab({ leadId, tasks }: { leadId: string; tasks: Task[] }) {
  const [open, setOpen] = useState(false);
  const createTask = useCreateTask();

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'MEDIUM' },
  });

  async function onSubmit(values: FormValues) {
    try {
      await createTask.mutateAsync({ leadId, ...values, dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : undefined });
      toast.success('Task created');
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to create task'));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}><Plus /> New Task</Button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState title="No tasks yet" description="Create follow-up tasks to keep the deal moving." />
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => <TaskRow key={t.id} task={t} />)}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input {...register('title')} placeholder="Send proposal" />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} {...register('description')} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" {...register('dueDate')} />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Controller control={control} name="priority" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Assign To</Label>
              <Controller control={control} name="assignedToId" render={({ field }) => <UserPicker value={field.value} onChange={field.onChange} />} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" loading={createTask.isPending}>Create Task</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const updateTask = useUpdateTask(task.id);
  const isDone = task.status === 'COMPLETED';
  const isOverdue = !isDone && task.dueDate && new Date(task.dueDate) < new Date();

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <Checkbox
        checked={isDone}
        onCheckedChange={(checked) => updateTask.mutate({ status: checked ? 'COMPLETED' : 'PENDING' })}
      />
      <div className="flex-1">
        <p className={cn('text-sm font-medium', isDone && 'text-muted-foreground line-through')}>{task.title}</p>
        {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
        <div className="mt-1 flex items-center gap-2 text-xs">
          {task.dueDate && <span className={cn('text-muted-foreground', isOverdue && 'font-medium text-destructive')}>Due {formatDate(task.dueDate)}</span>}
          {task.assignedTo && <span className="text-muted-foreground">· {task.assignedTo.firstName} {task.assignedTo.lastName}</span>}
        </div>
      </div>
      <TaskStatusBadge status={isOverdue ? 'OVERDUE' : task.status} />
    </div>
  );
}
