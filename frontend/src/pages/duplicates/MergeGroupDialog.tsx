import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  useMergeDuplicates,
  type DuplicateEntityType,
  type DuplicateGroup,
  type DuplicateCompanyRecord,
  type DuplicateContactRecord,
} from '@/api/duplicates';
import { apiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

type AnyRecord = DuplicateCompanyRecord & Partial<DuplicateContactRecord>;

function recordLabel(entityType: DuplicateEntityType, r: AnyRecord): string {
  return entityType === 'COMPANY' ? r.name : `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim();
}

function recordDetail(entityType: DuplicateEntityType, r: AnyRecord): string {
  if (entityType === 'COMPANY') return [r.domain || r.website, r.industry, r.country].filter(Boolean).join(' · ') || '—';
  return [r.email, r.phone, r.company?.name].filter(Boolean).join(' · ') || '—';
}

/**
 * Lets an admin pick which record in a duplicate group survives, then merges every other record
 * in the group into it — one pair at a time (the backend only merges two records per call), in
 * sequence. If a step fails partway through, whatever already merged stays merged (each merge is
 * independently transactional); the dialog reports the error and the next detection refresh shows
 * the group's true current state rather than pretending nothing happened.
 */
export function MergeGroupDialog({
  group,
  entityType,
  open,
  onOpenChange,
}: {
  group: DuplicateGroup<AnyRecord> | null;
  entityType: DuplicateEntityType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const merge = useMergeDuplicates();
  const [survivorId, setSurvivorId] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  useEffect(() => {
    if (open && group) setSurvivorId(group.records[0]?.id ?? null);
  }, [open, group]);

  if (!group) return null;

  const others = group.records.filter((r) => r.id !== survivorId);

  async function onConfirm() {
    if (!survivorId) return;
    setIsMerging(true);
    try {
      for (const other of others) {
        await merge.mutateAsync({ entityType, survivorId, duplicateId: other.id });
      }
      toast.success(`Merged ${others.length + 1} records into one`);
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Merge failed partway through — already-merged records stayed merged'));
    } finally {
      setIsMerging(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Merge {group.records.length} {entityType === 'COMPANY' ? 'companies' : 'contacts'}</DialogTitle>
          <DialogDescription>
            Pick the record to keep. Every other record's leads{entityType === 'COMPANY' ? ', contacts, documents, and activity' : ' and activity'}{' '}
            move to it, then the others are deleted. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {group.records.map((r) => {
            const selected = r.id === survivorId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSurvivorId(r.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors',
                  selected ? 'border-primary bg-primary/5' : 'border-border/60 hover:bg-accent'
                )}
              >
                <div>
                  <div className="text-sm font-medium">{recordLabel(entityType, r)}</div>
                  <div className="text-xs text-muted-foreground">{recordDetail(entityType, r)}</div>
                </div>
                {selected && (
                  <span className="flex items-center gap-1 text-xs font-medium text-primary">
                    <Check className="h-3.5 w-3.5" /> Keep
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isMerging}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" loading={isMerging} disabled={!survivorId} onClick={onConfirm}>
            Merge {others.length} into selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
