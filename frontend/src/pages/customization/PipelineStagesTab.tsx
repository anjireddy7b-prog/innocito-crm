import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePipelineStages, type PipelineStage } from '@/api/pipelineStages';
import { PipelineStageFormDialog } from './PipelineStageFormDialog';

export function PipelineStagesTab({ canManage }: { canManage: boolean }) {
  const { data: stages, isLoading } = usePipelineStages();
  const [editStage, setEditStage] = useState<PipelineStage | null>(null);

  const sorted = [...(stages ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  const columns: DataTableColumn<PipelineStage>[] = [
    { key: 'sortOrder', header: 'Order', cell: (s) => s.sortOrder },
    { key: 'label', header: 'Stage', cell: (s) => <span className="font-medium">{s.label}</span> },
    { key: 'key', header: 'Key', cell: (s) => <code className="text-xs text-muted-foreground">{s.key}</code> },
    {
      key: 'flags',
      header: 'Flags',
      cell: (s) => (
        <div className="flex gap-1">
          {s.isWon && <Badge variant="outline" className="text-emerald-600">Won</Badge>}
          {s.isLost && <Badge variant="outline" className="text-red-600">Lost</Badge>}
          {s.isTerminal && !s.isWon && !s.isLost && <Badge variant="outline">Terminal</Badge>}
        </div>
      ),
    },
  ];

  if (canManage) {
    columns.push({
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (s) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="icon" onClick={() => setEditStage(s)}><Pencil className="h-4 w-4" /></Button>
        </div>
      ),
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Rename, reorder, or re-flag the stages a lead moves through. Adding or removing stages isn&apos;t supported yet — a lead&apos;s
        status always comes from this fixed set.
      </p>

      <DataTable columns={columns} data={sorted} isLoading={isLoading} rowKey={(s) => s.id} emptyTitle="No pipeline stages found" />

      {canManage && <PipelineStageFormDialog stage={editStage} open={!!editStage} onOpenChange={(o) => !o && setEditStage(null)} />}
    </div>
  );
}
