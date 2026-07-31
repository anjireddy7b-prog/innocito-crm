import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Building2, Mail, Phone, Briefcase, Globe2, UserCog, Trash2, Pencil, Users2,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { LeadStatusBadge, PriorityBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useLead, useChangeLeadStatus, useDeleteLead } from '@/api/leads';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { apiErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate, humanizeEnum } from '@/lib/utils';
import { LEAD_STATUSES } from '@/types';
import { AssignLeadDialog } from '@/pages/leads/AssignLeadDialog';
import { LeadEditPanel } from '@/pages/leads/LeadEditPanel';
import { TimelineTab } from '@/pages/leads/tabs/TimelineTab';
import { MeetingsTab } from '@/pages/leads/tabs/MeetingsTab';
import { TasksTab } from '@/pages/leads/tabs/TasksTab';
import { DocumentsTab } from '@/pages/leads/tabs/DocumentsTab';
import { CommentsTab } from '@/pages/leads/tabs/CommentsTab';

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: lead, isLoading } = useLead(id);
  const changeStatus = useChangeLeadStatus(id!);
  const deleteLead = useDeleteLead();
  const hasRole = useAuthStore((s) => s.hasRole);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading || !lead) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  async function handleStatusChange(status: string) {
    if (status === lead!.status) return;
    let lossReason: string | undefined;
    if (status === 'LOST') {
      lossReason = window.prompt('Reason for loss (optional):') ?? undefined;
    }
    try {
      await changeStatus.mutateAsync({ status, lossReason });
      toast.success(`Status updated to ${humanizeEnum(status)}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Invalid status transition'));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/leads" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Leads
        </Link>
      </div>

      <PageHeader
        title={lead.company?.name ?? lead.displayId}
        description={`${lead.displayId} · Created ${formatDate(lead.createdAt)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setAssignOpen(true)}>
              <Users2 /> Assign
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
            {hasRole('ADMIN') && (
              <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="text-destructive" />
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <LeadStatusBadge status={lead.status} />
        <PriorityBadge priority={lead.priority} />
        {lead.category && <Badge variant="outline">{lead.category}</Badge>}
        <Select value={lead.status} onValueChange={handleStatusChange}>
          <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Change status…" /></SelectTrigger>
          <SelectContent>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{humanizeEnum(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-1">
          <Card>
            <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {lead.contact ? (
                <>
                  <p className="font-medium">{lead.contact.firstName} {lead.contact.lastName}</p>
                  {lead.contact.designation && <p className="flex items-center gap-2 text-muted-foreground"><Briefcase className="h-3.5 w-3.5" />{lead.contact.designation}</p>}
                  {lead.contact.email && <p className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /><a href={`mailto:${lead.contact.email}`} className="hover:text-primary hover:underline">{lead.contact.email}</a></p>}
                  {lead.contact.phone && <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" />{lead.contact.phone}</p>}
                </>
              ) : (
                <p className="text-muted-foreground">No contact linked.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Company</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {lead.company ? (
                <>
                  <Link to={`/companies/${lead.company.id}`} className="flex items-center gap-2 font-medium hover:text-primary hover:underline">
                    <Building2 className="h-3.5 w-3.5" />{lead.company.name}
                  </Link>
                  {lead.company.domain && <p className="flex items-center gap-2 text-muted-foreground"><Globe2 className="h-3.5 w-3.5" />{lead.company.domain}</p>}
                  {lead.company.website && <p className="flex items-center gap-2 text-muted-foreground"><Globe2 className="h-3.5 w-3.5" /><a href={lead.company.website} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">{lead.company.website}</a></p>}
                  {lead.company.industry && <p className="text-muted-foreground">{lead.company.industry}</p>}
                  {(lead.company.state || lead.company.country) && <p className="text-muted-foreground">{[lead.company.state, lead.company.country].filter(Boolean).join(', ')}</p>}
                  {lead.company.annualRevenue && <p className="text-muted-foreground">Revenue: {formatCurrency(lead.company.annualRevenue, 'USD')}</p>}
                </>
              ) : (
                <p className="text-muted-foreground">No company linked.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Deal & Ownership</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Deal Value</span><span className="font-medium">{formatCurrency(lead.dealValue, lead.currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Source</span><span>{humanizeEnum(lead.source)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Campaign</span><span>{lead.campaign?.name ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Expected Close</span><span>{formatDate(lead.expectedCloseDate)}</span></div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Assigned Rep</span>
                <span className="inline-flex items-center gap-1"><UserCog className="h-3.5 w-3.5" />{lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : 'Unassigned'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current Owner</span>
                <span>{lead.currentOwner ? `${lead.currentOwner.firstName} ${lead.currentOwner.lastName}` : 'Unassigned'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Lead Generated by</span>
                <span>{lead.sdr ? `${lead.sdr.firstName} ${lead.sdr.lastName}` : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Created By</span>
                <span>{lead.createdBySdr ? `${lead.createdBySdr.firstName} ${lead.createdBySdr.lastName}` : '—'}</span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Lead Received</span><span>{formatDate(lead.leadReceivedDate)}</span></div>
              {lead.lossReason && <div className="flex justify-between"><span className="text-muted-foreground">Loss Reason</span><span className="text-destructive">{lead.lossReason}</span></div>}
            </CardContent>
          </Card>

          {(lead.emailResponse || lead.nextSteps || lead.mom) && (
            <Card>
              <CardHeader><CardTitle>Legacy Notes</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {lead.emailResponse && <div><p className="text-xs font-medium text-muted-foreground">Email Response</p><p className="whitespace-pre-wrap">{lead.emailResponse}</p></div>}
                {lead.nextSteps && <div><p className="text-xs font-medium text-muted-foreground">Next Steps</p><p className="whitespace-pre-wrap">{lead.nextSteps}</p></div>}
                {lead.mom && <div><p className="text-xs font-medium text-muted-foreground">MoM</p><p className="whitespace-pre-wrap">{lead.mom}</p></div>}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2">
          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="meetings">Meetings ({lead._count?.meetings ?? 0})</TabsTrigger>
              <TabsTrigger value="tasks">Tasks ({lead._count?.tasks ?? 0})</TabsTrigger>
              <TabsTrigger value="documents">Documents ({lead._count?.documents ?? 0})</TabsTrigger>
              <TabsTrigger value="comments">Comments ({lead._count?.leadComments ?? 0})</TabsTrigger>
            </TabsList>
            <TabsContent value="timeline"><Card><CardContent className="p-5">
              <TimelineTab activities={lead.activities ?? []} />
            </CardContent></Card></TabsContent>
            <TabsContent value="meetings"><MeetingsTab leadId={lead.id} meetings={lead.meetings ?? []} /></TabsContent>
            <TabsContent value="tasks"><TasksTab leadId={lead.id} tasks={lead.tasks ?? []} /></TabsContent>
            <TabsContent value="documents"><DocumentsTab leadId={lead.id} documents={lead.documents ?? []} /></TabsContent>
            <TabsContent value="comments"><Card><CardContent className="p-5">
              <CommentsTab leadId={lead.id} />
            </CardContent></Card></TabsContent>
          </Tabs>
        </div>
      </div>

      <AssignLeadDialog lead={lead} open={assignOpen} onOpenChange={setAssignOpen} />
      <LeadEditPanel lead={lead} open={editOpen} onOpenChange={setEditOpen} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this lead?"
        description="The lead will be deactivated and hidden from all lists. This cannot be undone from the UI."
        destructive
        confirmLabel="Delete Lead"
        loading={deleteLead.isPending}
        onConfirm={() =>
          deleteLead.mutate(lead.id, {
            onSuccess: () => {
              toast.success('Lead deleted');
              navigate('/leads');
            },
          })
        }
      />
    </div>
  );
}
