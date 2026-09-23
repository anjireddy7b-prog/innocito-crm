import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Pencil, Trash2, Plus, ArrowUp, ArrowDown, UserPlus, Pause, Play, LogOut, Mail, Clock,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SequenceStatusBadge, SequenceEnrollmentStatusBadge } from '@/components/shared/StatusBadge';
import {
  useSequence, useUpdateSequence, useDeleteSequence, useDeleteStep, useMoveStep,
  useEnrollments, usePauseEnrollment, useResumeEnrollment, useExitEnrollment,
} from '@/api/sequences';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { apiErrorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';
import type { SequenceStatus, SequenceStep, SequenceEnrollment } from '@/types';
import { SequenceFormDialog } from '@/pages/sequences/SequenceFormDialog';
import { SequenceStepFormDialog } from '@/pages/sequences/SequenceStepFormDialog';
import { EnrollLeadDialog } from '@/pages/sequences/EnrollLeadDialog';

const STATUS_OPTIONS: SequenceStatus[] = ['DRAFT', 'ACTIVE', 'ARCHIVED'];

// Steps are shown/managed regardless of the sequence's current status — the backend places no
// status restriction on adding/editing/moving/deleting a step (see sequences.service.ts); the
// only guard is deleteStep refusing to remove a step an in-flight enrollment currently points to,
// which surfaces as a toast error from the mutation itself.
function StepsSection({ sequenceId, steps, canManage }: { sequenceId: string; steps: SequenceStep[]; canManage: boolean }) {
  const deleteStep = useDeleteStep(sequenceId);
  const moveStep = useMoveStep(sequenceId);
  const [formOpen, setFormOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<SequenceStep | null>(null);
  const [deletingStep, setDeletingStep] = useState<SequenceStep | null>(null);

  async function handleMove(stepId: string, direction: 'up' | 'down') {
    try {
      await moveStep.mutateAsync({ stepId, direction });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to reorder step'));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Steps</CardTitle>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => { setEditingStep(null); setFormOpen(true); }}>
            <Plus /> Add Step
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.length === 0 && (
          <EmptyState
            icon={Mail}
            title="No steps yet"
            description="Add at least one step before this sequence can be activated."
          />
        )}

        {steps.map((step, i) => (
          <div key={step.id} className="rounded-lg border border-border/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  Step {i + 1} · {i === 0 ? (step.delayDays === 0 ? 'Sent on enrollment' : `${step.delayDays} business day(s) after enrollment`) : (step.delayDays === 0 ? 'Sent right after the previous step' : `${step.delayDays} business day(s) after the previous step`)}
                </p>
                <p className="mt-1 truncate text-sm font-medium">{step.subject}</p>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{step.body}</p>
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" disabled={i === 0 || moveStep.isPending} onClick={() => handleMove(step.id, 'up')}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" disabled={i === steps.length - 1 || moveStep.isPending} onClick={() => handleMove(step.id, 'down')}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { setEditingStep(step); setFormOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeletingStep(step)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>

      <SequenceStepFormDialog
        sequenceId={sequenceId}
        step={editingStep}
        stepNumber={editingStep ? steps.findIndex((s) => s.id === editingStep.id) + 1 : steps.length + 1}
        open={formOpen}
        onOpenChange={setFormOpen}
      />

      <ConfirmDialog
        open={!!deletingStep}
        onOpenChange={(open) => !open && setDeletingStep(null)}
        title="Delete this step?"
        description="This cannot be undone. Blocked if any lead currently sits on this step — pause or exit those enrollments first."
        destructive
        confirmLabel="Delete Step"
        loading={deleteStep.isPending}
        onConfirm={() => {
          if (!deletingStep) return;
          deleteStep.mutate(deletingStep.id, {
            onSuccess: () => { toast.success('Step deleted'); setDeletingStep(null); },
            onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete step')),
          });
        }}
      />
    </Card>
  );
}

function EnrollmentRow({ enrollment, sequenceId }: { enrollment: SequenceEnrollment; sequenceId: string }) {
  const pause = usePauseEnrollment(sequenceId);
  const resume = useResumeEnrollment(sequenceId);
  const exit = useExitEnrollment(sequenceId);
  const isPending = pause.isPending || resume.isPending || exit.isPending;

  async function run(action: () => Promise<unknown>, successMessage: string) {
    try {
      await action();
      toast.success(successMessage);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to update enrollment'));
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link to={`/leads/${enrollment.leadId}`} className="truncate text-sm font-medium hover:text-primary hover:underline">
            {enrollment.lead?.displayId ?? enrollment.leadId}
          </Link>
          <SequenceEnrollmentStatusBadge status={enrollment.status} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {enrollment.lead?.contact ? `${enrollment.lead.contact.firstName} ${enrollment.lead.contact.lastName}` : '—'}
          {enrollment.currentStep && ` · On: ${enrollment.currentStep.subject}`}
        </p>
        {enrollment.status === 'ACTIVE' && enrollment.nextSendAt && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" /> Next send {formatDateTime(enrollment.nextSendAt)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {enrollment.status === 'ACTIVE' && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => pause.mutateAsync(enrollment.id), 'Enrollment paused')}>
            <Pause /> Pause
          </Button>
        )}
        {enrollment.status === 'PAUSED' && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => resume.mutateAsync(enrollment.id), 'Enrollment resumed')}>
            <Play /> Resume
          </Button>
        )}
        {(enrollment.status === 'ACTIVE' || enrollment.status === 'PAUSED') && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => exit.mutateAsync(enrollment.id), 'Enrollment exited')}>
            <LogOut /> Exit
          </Button>
        )}
      </div>
    </div>
  );
}

function EnrollmentsSection({ sequenceId, canManage, canEnroll }: { sequenceId: string; canManage: boolean; canEnroll: boolean }) {
  const { data, isLoading } = useEnrollments(sequenceId, { page: 1, pageSize: 50 });
  const [enrollOpen, setEnrollOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Enrollments</CardTitle>
        {canManage && canEnroll && (
          <Button size="sm" variant="outline" onClick={() => setEnrollOpen(true)}>
            <UserPlus /> Enroll a Lead
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}

        {!isLoading && data?.data.length === 0 && (
          <EmptyState
            icon={UserPlus}
            title="No enrollments yet"
            description={canEnroll ? 'Enroll a lead to start this sequence for them.' : 'Activate this sequence to start enrolling leads.'}
          />
        )}

        {!isLoading && data?.data.map((e) => <EnrollmentRow key={e.id} enrollment={e} sequenceId={sequenceId} />)}
      </CardContent>

      <EnrollLeadDialog sequenceId={sequenceId} open={enrollOpen} onOpenChange={setEnrollOpen} />
    </Card>
  );
}

export default function SequenceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: sequence, isLoading } = useSequence(id);
  const updateSequence = useUpdateSequence(id ?? '');
  const deleteSequence = useDeleteSequence();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading || !sequence) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const canManage = hasPermission(PERMISSIONS.SEQUENCES_MANAGE);
  const steps = sequence.steps ?? [];

  async function handleStatusChange(status: SequenceStatus) {
    try {
      await updateSequence.mutateAsync({ status });
      toast.success('Sequence status updated');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to update status'));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/sequences" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Sequences
        </Link>
      </div>

      <PageHeader
        title={sequence.name}
        description={sequence.description ?? undefined}
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil /> Edit
              </Button>
              <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="text-destructive" />
              </Button>
            </>
          )
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-1">
          <Card>
            <CardHeader><CardTitle>Sequence Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                {canManage ? (
                  <Select value={sequence.status} onValueChange={(v) => handleStatusChange(v as SequenceStatus)}>
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <SequenceStatusBadge status={sequence.status} />
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Steps</span>
                <span>{steps.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Active Enrollments</span>
                <span>{sequence.activeEnrollmentCount ?? 0}</span>
              </div>
              {sequence.createdBy && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Created By</span>
                  <span>{sequence.createdBy.firstName} {sequence.createdBy.lastName}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(sequence.createdAt)}</span>
              </div>
              {sequence.description && (
                <div className="pt-2">
                  <p className="text-xs font-medium text-muted-foreground">Description</p>
                  <p className="whitespace-pre-wrap">{sequence.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <StepsSection sequenceId={sequence.id} steps={steps} canManage={canManage} />
          <EnrollmentsSection sequenceId={sequence.id} canManage={canManage} canEnroll={sequence.status === 'ACTIVE'} />
        </div>
      </div>

      <SequenceFormDialog sequence={sequence} open={editOpen} onOpenChange={setEditOpen} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this sequence?"
        description="Blocked if this sequence has any enrollment history at all (past or present) — archive it instead in that case."
        destructive
        confirmLabel="Delete Sequence"
        loading={deleteSequence.isPending}
        onConfirm={() =>
          deleteSequence.mutate(sequence.id, {
            onSuccess: () => {
              toast.success('Sequence deleted');
              navigate('/sequences');
            },
            onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete sequence')),
          })
        }
      />
    </div>
  );
}
