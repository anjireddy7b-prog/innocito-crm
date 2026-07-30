import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, FileText, Trash2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useUploadDocument, useDeleteDocument } from '@/api/documents';
import { apiErrorMessage } from '@/lib/api';
import { formatDate, humanizeEnum } from '@/lib/utils';
import type { Document, DocumentType } from '@/types';

const DOC_TYPES: DocumentType[] = ['PROPOSAL', 'MOM', 'PRESENTATION', 'CONTRACT', 'BROCHURE', 'OTHER'];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsTab({ leadId, documents }: { leadId: string; documents: Document[] }) {
  const [docType, setDocType] = useState<DocumentType>('OTHER');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadDocument();
  const remove = useDeleteDocument();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await upload.mutateAsync({ file, leadId, documentType: docType });
      toast.success('Document uploaded');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Upload failed'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select value={docType} onValueChange={(v) => setDocType(v as DocumentType)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{humanizeEnum(t)}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" onClick={() => fileInputRef.current?.click()} loading={upload.isPending}>
          <Upload /> Upload Document
        </Button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} />
      </div>

      {documents.length === 0 ? (
        <EmptyState icon={FileText} title="No documents uploaded" description="Upload proposals, MoMs, presentations, or contracts." />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 p-3">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{doc.originalName}</p>
                <p className="text-xs text-muted-foreground">
                  {humanizeEnum(doc.documentType)} · {formatSize(doc.sizeBytes)} · {formatDate(doc.createdAt)}
                  {doc.uploadedBy && ` · ${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`}
                </p>
              </div>
              <Button variant="ghost" size="icon" asChild>
                <a href={doc.storagePath} target="_blank" rel="noreferrer" download>
                  <Download className="h-4 w-4" />
                </a>
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setDeleteId(doc.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Delete document?"
        description="This document will be permanently removed."
        destructive
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleteId && remove.mutate(deleteId, { onSuccess: () => { toast.success('Document deleted'); setDeleteId(null); } })}
      />
    </div>
  );
}
