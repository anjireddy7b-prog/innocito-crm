import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  useCreateReportDefinition, useUpdateReportDefinition, useRunReportPreview,
  REPORT_GROUP_BY_OPTIONS, REPORT_GROUP_BY_LABELS, REPORT_METRIC_OPTIONS, REPORT_METRIC_LABELS,
  REPORT_CHART_TYPE_OPTIONS, type CustomReportDefinition, type ReportFilters, type ReportGroupBy,
  type ReportMetric, type ReportChartType,
} from '@/api/reportBuilder';
import { useCampaigns } from '@/api/campaigns';
import { useAssignableUsers } from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { LEAD_STATUSES, LEAD_SOURCES, LEAD_PRIORITIES } from '@/types';
import { humanizeEnum } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { ReportResultView } from './ReportResultView';

const CHART_TYPE_LABELS: Record<ReportChartType, string> = { TABLE: 'Table', BAR: 'Bar Chart', PIE: 'Pie Chart', LINE: 'Line Chart' };

const ALL = '__all__';

function emptyFilters(): ReportFilters {
  return { includeInactive: false };
}

export function ReportBuilderDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: CustomReportDefinition | null;
}) {
  const isEdit = !!existing;
  const canManageShared = useAuthStore((s) => s.hasPermission(PERMISSIONS.REPORTS_MANAGE_SHARED));
  const { data: campaigns } = useCampaigns();
  const { data: assignableUsers } = useAssignableUsers();

  const createReport = useCreateReportDefinition();
  const updateReport = useUpdateReportDefinition(existing?.id ?? '');
  const preview = useRunReportPreview();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupBy, setGroupBy] = useState<ReportGroupBy>('STATUS');
  const [metric, setMetric] = useState<ReportMetric>('COUNT');
  const [chartType, setChartType] = useState<ReportChartType>('BAR');
  const [isShared, setIsShared] = useState(false);
  const [filters, setFilters] = useState<ReportFilters>(emptyFilters());

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setName(existing.name);
      setDescription(existing.description ?? '');
      setGroupBy(existing.groupBy);
      setMetric(existing.metric);
      setChartType(existing.chartType);
      setIsShared(existing.isShared);
      setFilters({ ...emptyFilters(), ...existing.filters });
    } else {
      setName('');
      setDescription('');
      setGroupBy('STATUS');
      setMetric('COUNT');
      setChartType('BAR');
      setIsShared(false);
      setFilters(emptyFilters());
    }
    preview.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.id]);

  function updateFilter<K extends keyof ReportFilters>(key: K, value: ReportFilters[K] | undefined) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function config() {
    return { groupBy, metric, chartType, filters };
  }

  async function handlePreview() {
    try {
      await preview.mutateAsync(config());
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to run report'));
    }
  }

  async function handleSave() {
    try {
      if (isEdit) {
        await updateReport.mutateAsync({ name, description: description || null, isShared, ...config() });
        toast.success('Report updated');
      } else {
        await createReport.mutateAsync({ name, description: description || undefined, isShared, ...config() });
        toast.success('Report saved');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to ${isEdit ? 'update' : 'save'} report`));
    }
  }

  const isSaving = createReport.isPending || updateReport.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Report' : 'New Custom Report'}</DialogTitle>
          <DialogDescription>
            Pick how to group your leads and what to measure, optionally filter which leads are considered, then preview before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pipeline by Rep" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes about what this report is for" rows={2} />
            </div>

            <div className="space-y-1.5">
              <Label>Group By *</Label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as ReportGroupBy)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_GROUP_BY_OPTIONS.map((g) => <SelectItem key={g} value={g}>{REPORT_GROUP_BY_LABELS[g]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Measure *</Label>
              <Select value={metric} onValueChange={(v) => setMetric(v as ReportMetric)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_METRIC_OPTIONS.map((m) => <SelectItem key={m} value={m}>{REPORT_METRIC_LABELS[m]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Chart Type *</Label>
              <Select value={chartType} onValueChange={(v) => setChartType(v as ReportChartType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_CHART_TYPE_OPTIONS.map((c) => <SelectItem key={c} value={c}>{CHART_TYPE_LABELS[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {canManageShared && (
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <Checkbox checked={isShared} onCheckedChange={(c) => setIsShared(c === true)} />
                Share with the whole organization
              </label>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-medium">Filters (optional)</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={filters.status ?? ALL} onValueChange={(v) => updateFilter('status', v === ALL ? undefined : v)}>
                  <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{humanizeEnum(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <Select value={filters.priority ?? ALL} onValueChange={(v) => updateFilter('priority', v === ALL ? undefined : v)}>
                  <SelectTrigger><SelectValue placeholder="All priorities" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All priorities</SelectItem>
                    {LEAD_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{humanizeEnum(p)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Source</Label>
                <Select value={filters.source ?? ALL} onValueChange={(v) => updateFilter('source', v === ALL ? undefined : v)}>
                  <SelectTrigger><SelectValue placeholder="All sources" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All sources</SelectItem>
                    {LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{humanizeEnum(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Campaign</Label>
                <Select value={filters.campaignId ?? ALL} onValueChange={(v) => updateFilter('campaignId', v === ALL ? undefined : v)}>
                  <SelectTrigger><SelectValue placeholder="All campaigns" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All campaigns</SelectItem>
                    {(campaigns?.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Assigned Rep</Label>
                <Select value={filters.assignedToId ?? ALL} onValueChange={(v) => updateFilter('assignedToId', v === ALL ? undefined : v)}>
                  <SelectTrigger><SelectValue placeholder="Anyone" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Anyone</SelectItem>
                    {(assignableUsers ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Current Owner</Label>
                <Select value={filters.ownerId ?? ALL} onValueChange={(v) => updateFilter('ownerId', v === ALL ? undefined : v)}>
                  <SelectTrigger><SelectValue placeholder="Anyone" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Anyone</SelectItem>
                    {(assignableUsers ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Date Field</Label>
                <Select
                  value={filters.dateField ?? ALL}
                  onValueChange={(v) => updateFilter('dateField', v === ALL ? undefined : (v as ReportFilters['dateField']))}
                >
                  <SelectTrigger><SelectValue placeholder="No date filter" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>No date filter</SelectItem>
                    <SelectItem value="createdAt">Date Created</SelectItem>
                    <SelectItem value="leadReceivedDate">Lead Received Date</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input
                  type="date"
                  disabled={!filters.dateField}
                  value={filters.dateFrom ?? ''}
                  onChange={(e) => updateFilter('dateFrom', e.target.value || undefined)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input
                  type="date"
                  disabled={!filters.dateField}
                  value={filters.dateTo ?? ''}
                  onChange={(e) => updateFilter('dateTo', e.target.value || undefined)}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={filters.includeInactive ?? false} onCheckedChange={(c) => updateFilter('includeInactive', c === true)} />
              Include inactive (deleted) leads
            </label>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Preview</p>
              <Button type="button" variant="outline" size="sm" onClick={handlePreview} loading={preview.isPending}>
                Run Preview
              </Button>
            </div>
            {preview.data && <ReportResultView result={preview.data} />}
            {!preview.data && !preview.isPending && (
              <p className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                Run a preview to see this report's results before saving.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleSave} loading={isSaving} disabled={!name.trim()}>
            {isEdit ? 'Save Changes' : 'Save Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
