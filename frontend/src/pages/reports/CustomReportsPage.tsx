import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Play, Pencil, Trash2, Users, User as UserIcon, PieChart, Pin, PinOff } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { apiErrorMessage } from '@/lib/api';
import {
  useReportDefinitions, useDeleteReportDefinition, useRunSavedReport,
  REPORT_GROUP_BY_LABELS, REPORT_METRIC_LABELS, type CustomReportDefinition,
} from '@/api/reportBuilder';
import { useMyWidgets, usePinReport, useUnpinWidget } from '@/api/dashboardWidgets';
import { ReportBuilderDialog } from './ReportBuilderDialog';
import { ReportResultView } from './ReportResultView';
import { MyDashboardTab } from './MyDashboardTab';

// Phase 10 (reporting/dashboard builder), slice 1 — custom report builder. Lists both the
// caller's own personal reports and every shared (organization-wide) one, mirroring
// SavedViewsMenu.tsx's "My Reports" / "Shared with your team" grouping and ownership rules exactly
// (see reportBuilder.service.ts). Unlike the fixed Dashboard/Reports pages, every report here is
// user-defined: pick a dimension, a measure, optional filters, and a chart type.

function ReportCard({
  report,
  canManage,
  onEdit,
  onDelete,
  onRun,
  pinned,
  onTogglePin,
  pinToggling,
}: {
  report: CustomReportDefinition;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRun: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  pinToggling: boolean;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-1">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{report.name}</CardTitle>
          {report.isShared ? (
            <Badge variant="outline" className="shrink-0 gap-1"><Users className="h-3 w-3" /> Shared</Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 gap-1"><UserIcon className="h-3 w-3" /> Personal</Badge>
          )}
        </div>
        {report.description && <p className="text-sm text-muted-foreground">{report.description}</p>}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Badge variant="secondary">{REPORT_GROUP_BY_LABELS[report.groupBy]}</Badge>
          <Badge variant="secondary">{REPORT_METRIC_LABELS[report.metric]}</Badge>
          <Badge variant="secondary">{report.chartType}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-2 pt-0">
        <Button type="button" size="sm" onClick={onRun}>
          <Play /> Run
        </Button>
        <div className="flex gap-1">
          <Button
            type="button"
            variant={pinned ? 'secondary' : 'ghost'}
            size="icon"
            disabled={pinToggling}
            onClick={onTogglePin}
            aria-label={pinned ? `Unpin ${report.name} from My Dashboard` : `Pin ${report.name} to My Dashboard`}
          >
            {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </Button>
          {canManage && (
            <>
              <Button type="button" variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${report.name}`}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label={`Delete ${report.name}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ReportRunDialog({ reportId, name, onOpenChange }: { reportId: string | null; name?: string; onOpenChange: (open: boolean) => void }) {
  const { data, isLoading } = useRunSavedReport(reportId ?? undefined);
  return (
    <Dialog open={!!reportId} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>Results as of right now — re-open this report any time to see current data.</DialogDescription>
        </DialogHeader>
        {isLoading || !data ? <Skeleton className="h-80 rounded-xl" /> : <ReportResultView result={data} />}
      </DialogContent>
    </Dialog>
  );
}

export default function CustomReportsPage() {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const canManageShared = useAuthStore((s) => s.hasPermission(PERMISSIONS.REPORTS_MANAGE_SHARED));
  const { data: reports, isLoading } = useReportDefinitions('LEAD');
  const deleteReport = useDeleteReportDefinition();

  // Pin state is fetched here (not just inside MyDashboardTab) so each ReportCard on the "Reports"
  // tab can show whether it's currently pinned, and toggle it, without needing its own tab switch.
  const { data: widgets } = useMyWidgets();
  const pinReport = usePinReport();
  const unpinWidget = useUnpinWidget();
  const widgetByReportId = new Map((widgets ?? []).map((w) => [w.reportDefinitionId, w]));

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<CustomReportDefinition | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomReportDefinition | null>(null);

  function canManage(report: CustomReportDefinition) {
    return report.isShared ? canManageShared : report.createdById === currentUserId;
  }

  async function togglePin(report: CustomReportDefinition) {
    const existing = widgetByReportId.get(report.id);
    try {
      if (existing) {
        await unpinWidget.mutateAsync(existing.id);
        toast.success(`Removed "${report.name}" from My Dashboard`);
      } else {
        await pinReport.mutateAsync(report.id);
        toast.success(`Pinned "${report.name}" to My Dashboard`);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to update your dashboard'));
    }
  }

  const personal = (reports ?? []).filter((r) => !r.isShared);
  const shared = (reports ?? []).filter((r) => r.isShared);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Custom Reports"
        description="Build your own report — pick a dimension to group by, a measure, and optional filters — then save and re-run it any time. Pin any report to My Dashboard to see it there live."
        actions={
          <Button onClick={() => { setEditing(null); setBuilderOpen(true); }}>
            <Plus /> New Report
          </Button>
        }
      />

      <Tabs defaultValue="reports">
        <TabsList>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="dashboard">My Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-6">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
            </div>
          ) : (reports ?? []).length === 0 ? (
            <EmptyState
              icon={PieChart}
              title="No custom reports yet"
              description="Create your first report to see leads grouped and measured exactly the way you want."
              action={
                <Button onClick={() => { setEditing(null); setBuilderOpen(true); }}>
                  <Plus /> New Report
                </Button>
              }
            />
          ) : (
            <div className="space-y-6">
              <div className="space-y-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <UserIcon className="h-3.5 w-3.5" /> My Reports
                </p>
                {personal.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No personal reports yet.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {personal.map((r) => (
                      <ReportCard
                        key={r.id}
                        report={r}
                        canManage={canManage(r)}
                        onRun={() => setRunningId(r.id)}
                        onEdit={() => { setEditing(r); setBuilderOpen(true); }}
                        onDelete={() => setDeleteTarget(r)}
                        pinned={widgetByReportId.has(r.id)}
                        onTogglePin={() => togglePin(r)}
                        pinToggling={pinReport.isPending || unpinWidget.isPending}
                      />
                    ))}
                  </div>
                )}
              </div>

              {(shared.length > 0 || canManageShared) && (
                <div className="space-y-3 border-t border-border/60 pt-6">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Users className="h-3.5 w-3.5" /> Shared with your team
                  </p>
                  {shared.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No shared reports yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {shared.map((r) => (
                        <ReportCard
                          key={r.id}
                          report={r}
                          canManage={canManage(r)}
                          onRun={() => setRunningId(r.id)}
                          onEdit={() => { setEditing(r); setBuilderOpen(true); }}
                          onDelete={() => setDeleteTarget(r)}
                          pinned={widgetByReportId.has(r.id)}
                          onTogglePin={() => togglePin(r)}
                          pinToggling={pinReport.isPending || unpinWidget.isPending}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="dashboard">
          <MyDashboardTab />
        </TabsContent>
      </Tabs>

      <ReportBuilderDialog open={builderOpen} onOpenChange={setBuilderOpen} existing={editing} />
      <ReportRunDialog reportId={runningId} name={reports?.find((r) => r.id === runningId)?.name} onOpenChange={(o) => !o && setRunningId(null)} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description={deleteTarget?.isShared ? 'This removes it for everyone in your organization.' : 'This only removes it for you.'}
        destructive
        confirmLabel="Delete Report"
        loading={deleteReport.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteReport.mutateAsync(deleteTarget.id);
            toast.success('Report deleted');
            setDeleteTarget(null);
          } catch (err) {
            toast.error(apiErrorMessage(err, 'Failed to delete report'));
          }
        }}
      />
    </div>
  );
}
