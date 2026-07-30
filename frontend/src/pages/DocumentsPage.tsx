import { useState } from 'react';
import { toast } from 'sonner';
import { FileText, Download, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, DataTableColumn } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useDocuments, useDeleteDocument } from '@/api/documents';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { formatDate, humanizeEnum } from '@/lib/utils';
import type { Document } from '@/types';

type DocumentWithLead = Document & { lead?: { id: string; leadNumber: number; company?: { name: string } | null } | null };

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const { data: documents, isLoading } = useDocuments() as { data?: DocumentWithLead[]; isLoading: boolean };
  const deleteDocument = useDeleteDocument();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const columns: DataTableColumn<DocumentWithLead>[] = [
    {
      key: 'name',
      header: 'Document',
      cell: (d) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">{d.originalName}</p>
            <p className="text-xs text-muted-foreground">{d.lead?.company?.name ?? ''}</p>
          </div>
        </div>
      ),
    },
    { key: 'type', header: 'Type', cell: (d) => <Badge variant="outline">{humanizeEnum(d.documentType)}</Badge> },
    { key: 'size', header: 'Size', cell: (d) => formatSize(d.sizeBytes) },
    { key: 'uploadedBy', header: 'Uploaded By', cell: (d) => d.uploadedBy ? `${d.uploadedBy.firstName} ${d.uploadedBy.lastName}` : '—' },
    { key: 'createdAt', header: 'Uploaded', cell: (d) => formatDate(d.createdAt) },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (d) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" asChild>
            <a href={d.storagePath} target="_blank" rel="noreferrer" download onClick={(e) => e.stopPropagation()}>
              <Download className="h-4 w-4" />
            </a>
          </Button>
          {hasPermission(PERMISSIONS.DOCUMENTS_DELETE) && (
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDeleteId(d.id); }}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Documents" description="Proposals, MoMs, presentations, and contracts uploaded across all leads." />

      <DataTable
        columns={columns}
        data={documents ?? []}
        isLoading={isLoading}
        rowKey={(d) => d.id}
        emptyTitle="No documents uploaded"
        emptyDescription="Documents uploaded from a lead's Documents tab will show up here."
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Delete document?"
        description="This document will be permanently removed."
        destructive
        confirmLabel="Delete"
        loading={deleteDocument.isPending}
        onConfirm={() => deleteId && deleteDocument.mutate(deleteId, { onSuccess: () => { toast.success('Document deleted'); setDeleteId(null); } })}
      />
    </div>
  );
}
