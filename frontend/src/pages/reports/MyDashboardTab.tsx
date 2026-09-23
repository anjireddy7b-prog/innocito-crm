import { toast } from 'sonner';
import { ChevronUp, ChevronDown, PinOff, LayoutDashboard } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiErrorMessage } from '@/lib/api';
import { REPORT_GROUP_BY_LABELS, REPORT_METRIC_LABELS, useRunSavedReport } from '@/api/reportBuilder';
import { useMyWidgets, useUnpinWidget, useReorderWidgets, type DashboardWidget } from '@/api/dashboardWidgets';
import { ReportResultView } from './ReportResultView';

// Phase 10 (reporting/dashboard builder), slice 2 — "My Dashboard" is purely personal (no
// isShared model, see dashboardWidgets table's own comment): every widget here is one of the
// caller's pinned saved reports, always re-run live (useRunSavedReport), never a cached snapshot.
// Reordering resends the caller's FULL widget-id list in the new order (see
// dashboardWidgets.service.ts's reorderWidgets) rather than a single move op, so move-up/move-down
// below just swap two entries in the existing list and send the whole thing back.

function WidgetCard({
  widget,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onUnpin,
  unpinning,
  reordering,
}: {
  widget: DashboardWidget;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUnpin: () => void;
  unpinning: boolean;
  reordering: boolean;
}) {
  const { data: result, isLoading, isError } = useRunSavedReport(widget.reportDefinitionId);
  const def = widget.reportDefinition;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">{def.name}</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{REPORT_GROUP_BY_LABELS[def.groupBy]}</Badge>
            <Badge variant="secondary">{REPORT_METRIC_LABELS[def.metric]}</Badge>
            <Badge variant="secondary">{def.chartType}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button type="button" variant="ghost" size="icon" disabled={isFirst || reordering} onClick={onMoveUp} aria-label={`Move ${def.name} up`}>
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" disabled={isLast || reordering} onClick={onMoveDown} aria-label={`Move ${def.name} down`}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" disabled={unpinning} onClick={onUnpin} aria-label={`Unpin ${def.name}`}>
            <PinOff className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isError ? (
          <p className="text-sm text-muted-foreground">Couldn't load this report right now.</p>
        ) : isLoading || !result ? (
          <Skeleton className="h-56 rounded-xl" />
        ) : (
          <ReportResultView result={result} />
        )}
      </CardContent>
    </Card>
  );
}

export function MyDashboardTab() {
  const { data: widgets, isLoading } = useMyWidgets();
  const unpinWidget = useUnpinWidget();
  const reorderWidgets = useReorderWidgets();

  const sorted = [...(widgets ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    reorderWidgets.mutate(reordered.map((w) => w.id), {
      onError: (err) => toast.error(apiErrorMessage(err, 'Failed to reorder')),
    });
  }

  async function unpin(widget: DashboardWidget) {
    try {
      await unpinWidget.mutateAsync(widget.id);
      toast.success(`Removed "${widget.reportDefinition.name}" from your dashboard`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to unpin'));
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={LayoutDashboard}
        title="Nothing pinned yet"
        description='Pin a report from the "Reports" tab to see it here, live, every time you open your dashboard.'
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {sorted.map((widget, index) => (
        <WidgetCard
          key={widget.id}
          widget={widget}
          isFirst={index === 0}
          isLast={index === sorted.length - 1}
          onMoveUp={() => move(index, -1)}
          onMoveDown={() => move(index, 1)}
          onUnpin={() => unpin(widget)}
          unpinning={unpinWidget.isPending}
          reordering={reorderWidgets.isPending}
        />
      ))}
    </div>
  );
}
