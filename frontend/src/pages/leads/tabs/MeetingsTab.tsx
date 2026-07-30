import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, MapPin, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { MeetingStatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { useCreateMeeting, useUpdateMeeting } from '@/api/meetings';
import { apiErrorMessage } from '@/lib/api';
import { formatDateTime, humanizeEnum } from '@/lib/utils';
import type { Meeting, MeetingType, MeetingStatus } from '@/types';

const MEETING_TYPES: MeetingType[] = ['DISCOVERY', 'DEMO', 'FOLLOW_UP', 'TECHNICAL', 'NEGOTIATION', 'CLOSING', 'OTHER'];
const MEETING_STATUSES: MeetingStatus[] = ['SCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED', 'RESCHEDULED'];

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  type: z.string(),
  scheduledAt: z.string().min(1, 'Date & time is required'),
  durationMins: z.coerce.number().min(5).max(480),
  location: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function MeetingsTab({ leadId, meetings }: { leadId: string; meetings: Meeting[] }) {
  const [open, setOpen] = useState(false);
  const [momEditId, setMomEditId] = useState<string | null>(null);
  const createMeeting = useCreateMeeting();

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'DISCOVERY', durationMins: 30 },
  });

  async function onSubmit(values: FormValues) {
    try {
      await createMeeting.mutateAsync({ leadId, ...values, scheduledAt: new Date(values.scheduledAt).toISOString() });
      toast.success('Meeting scheduled');
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to schedule meeting'));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}><Plus /> Schedule Meeting</Button>
      </div>

      {meetings.length === 0 ? (
        <EmptyState title="No meetings scheduled" description="Schedule a discovery call, demo, or follow-up." />
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => (
            <MeetingCard key={m.id} meeting={m} editingMom={momEditId === m.id} onToggleMom={() => setMomEditId(momEditId === m.id ? null : m.id)} />
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule Meeting</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input {...register('title')} placeholder="Discovery call with…" />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Controller control={control} name="type" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MEETING_TYPES.map((t) => <SelectItem key={t} value={t}>{humanizeEnum(t)}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Duration (mins)</Label>
                <Input type="number" min={5} max={480} {...register('durationMins')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Date & Time *</Label>
              <Input type="datetime-local" {...register('scheduledAt')} />
              {errors.scheduledAt && <p className="text-xs text-destructive">{errors.scheduledAt.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Location / Meeting Link</Label>
              <Input {...register('location')} placeholder="Zoom link or office address" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" loading={createMeeting.isPending}>Schedule</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MeetingCard({ meeting, editingMom, onToggleMom }: { meeting: Meeting; editingMom: boolean; onToggleMom: () => void }) {
  const updateMeeting = useUpdateMeeting(meeting.id);
  const [mom, setMom] = useState(meeting.mom ?? '');

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{meeting.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDateTime(meeting.scheduledAt)} · {meeting.durationMins}m</span>
              {meeting.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{meeting.location}</span>}
              <span>{humanizeEnum(meeting.type)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MeetingStatusBadge status={meeting.status} />
            <Select value={meeting.status} onValueChange={(status) => updateMeeting.mutate({ status })}>
              <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{MEETING_STATUSES.map((s) => <SelectItem key={s} value={s}>{humanizeEnum(s)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {editingMom ? (
          <div className="space-y-2">
            <Textarea rows={3} value={mom} onChange={(e) => setMom(e.target.value)} placeholder="Minutes of Meeting…" />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={onToggleMom}>Cancel</Button>
              <Button
                size="sm"
                loading={updateMeeting.isPending}
                onClick={() => updateMeeting.mutate({ mom }, { onSuccess: () => { toast.success('MoM saved'); onToggleMom(); } })}
              >
                Save MoM
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            {meeting.mom ? <p className="whitespace-pre-wrap">{meeting.mom}</p> : <p className="text-muted-foreground">No Minutes of Meeting recorded yet.</p>}
            <Button variant="link" size="sm" className="mt-1 h-auto p-0" onClick={onToggleMom}>
              {meeting.mom ? 'Edit MoM' : 'Add MoM'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
