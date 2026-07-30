import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Pencil, Trash2, Calendar, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { LeadStatusBadge } from '@/components/shared/StatusBadge';
import { useCampaign, useDeleteCampaign } from '@/api/campaigns';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { formatCurrency, formatDate } from '@/lib/utils';
import { CampaignFormDialog } from '@/pages/campaigns/CampaignFormDialog';

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: campaign, isLoading } = useCampaign(id);
  const deleteCampaign = useDeleteCampaign();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading || !campaign) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const canManage = hasPermission(PERMISSIONS.CAMPAIGNS_MANAGE);
  const won = campaign.leads?.filter((l) => l.status === 'WON').length ?? 0;
  const lost = campaign.leads?.filter((l) => l.status === 'LOST').length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/campaigns" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Campaigns
        </Link>
      </div>

      <PageHeader
        title={campaign.name}
        description={campaign.code ?? undefined}
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
            <CardHeader><CardTitle>Campaign Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="outline">{campaign.status}</Badge></div>
              {campaign.startDate && <p className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-3.5 w-3.5" />{formatDate(campaign.startDate)} — {formatDate(campaign.endDate)}</p>}
              {campaign.budget && <p className="flex items-center gap-2 text-muted-foreground"><Wallet className="h-3.5 w-3.5" />Budget: {formatCurrency(campaign.budget)}</p>}
              {campaign.description && (
                <div className="pt-2">
                  <p className="text-xs font-medium text-muted-foreground">Description</p>
                  <p className="whitespace-pre-wrap">{campaign.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Performance</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total Leads</span><span className="font-medium">{campaign._count?.leads ?? campaign.leads?.length ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Won</span><span className="font-medium text-success">{won}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Lost</span><span className="font-medium text-destructive">{lost}</span></div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Leads ({campaign.leads?.length ?? 0})</CardTitle></CardHeader>
            <CardContent>
              {campaign.leads?.length ? (
                <div className="divide-y divide-border">
                  {campaign.leads.map((l) => (
                    <div
                      key={l.id}
                      className="flex cursor-pointer items-center justify-between py-3 hover:bg-muted/50"
                      onClick={() => navigate(`/leads/${l.id}`)}
                    >
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">{l.displayId}</p>
                        <p className="font-medium">{l.company?.name ?? 'Lead'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">{formatCurrency(l.dealValue, l.currency)}</span>
                        <LeadStatusBadge status={l.status} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No leads yet" description="Leads sourced from this campaign will appear here." />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <CampaignFormDialog campaign={campaign} open={editOpen} onOpenChange={setEditOpen} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this campaign?"
        description="This cannot be undone. Leads linked to this campaign will remain but lose their campaign reference."
        destructive
        confirmLabel="Delete Campaign"
        loading={deleteCampaign.isPending}
        onConfirm={() =>
          deleteCampaign.mutate(campaign.id, {
            onSuccess: () => {
              toast.success('Campaign deleted');
              navigate('/campaigns');
            },
          })
        }
      />
    </div>
  );
}
