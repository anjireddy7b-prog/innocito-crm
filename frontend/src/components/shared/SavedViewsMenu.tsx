import { useState } from 'react';
import { Bookmark, Plus, Trash2, Users, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useSavedViews, useCreateSavedView, useDeleteSavedView, type SavedView } from '@/api/savedViews';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { apiErrorMessage } from '@/lib/api';

/**
 * Phase 7 ("custom views/nav"): a saved filter/sort preset for a list page. Built as a Popover
 * rather than the DropdownMenu used elsewhere (UserMenu.tsx, Sidebar.tsx's tooltips) specifically
 * because a DropdownMenuItem closes the menu on any click inside it — this needs an inline delete
 * button per row that doesn't dismiss the list, so a Popover's own "closes on outside click only"
 * behavior is the better fit.
 *
 * `currentFilters`/`onApply` are the list page's own URLSearchParams-derived query state, passed
 * through as a plain string bag rather than this component owning any of it — a saved view IS
 * exactly that bag (see api/savedViews.ts), so saving is "store what's already in the URL" and
 * applying is "replace the URL with what's stored," with no translation layer in between.
 */
export function SavedViewsMenu({
  entityType = 'LEAD',
  currentFilters,
  onApply,
}: {
  entityType?: string;
  currentFilters: Record<string, string>;
  onApply: (filters: Record<string, string>) => void;
}) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const canManageShared = hasPermission(PERMISSIONS.SAVED_VIEWS_MANAGE_SHARED);

  const { data: views, isLoading } = useSavedViews(entityType);
  const createView = useCreateSavedView();
  const deleteView = useDeleteSavedView();

  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveShared, setSaveShared] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavedView | null>(null);

  const personalViews = (views ?? []).filter((v) => !v.isShared);
  const sharedViews = (views ?? []).filter((v) => v.isShared);

  function canManage(view: SavedView) {
    return view.isShared ? canManageShared : view.createdById === currentUserId;
  }

  async function handleSave() {
    try {
      await createView.mutateAsync({ entityType, name: saveName.trim(), filters: currentFilters, isShared: saveShared });
      toast.success('View saved');
      setSaveOpen(false);
      setSaveName('');
      setSaveShared(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to save view'));
    }
  }

  function renderRow(view: SavedView) {
    return (
      <div key={view.id} className="group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary/70">
        <button
          type="button"
          className="flex-1 truncate text-left"
          onClick={() => {
            onApply(view.filters);
            setOpen(false);
          }}
        >
          {view.name}
        </button>
        {canManage(view) && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
            onClick={() => setDeleteTarget(view)}
            aria-label={`Delete ${view.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline">
            <Bookmark /> Views
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-3">
          <div className="space-y-0.5">
            <p className="flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <UserIcon className="h-3.5 w-3.5" /> My Views
            </p>
            {isLoading && <p className="px-2 py-1 text-sm text-muted-foreground">Loading…</p>}
            {!isLoading && personalViews.length === 0 && (
              <p className="px-2 py-1 text-sm text-muted-foreground">No personal views yet.</p>
            )}
            {personalViews.map(renderRow)}
          </div>

          {(sharedViews.length > 0 || canManageShared) && (
            <div className="space-y-0.5 border-t border-border/60 pt-3">
              <p className="flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Shared with your team
              </p>
              {sharedViews.length === 0 && <p className="px-2 py-1 text-sm text-muted-foreground">No shared views yet.</p>}
              {sharedViews.map(renderRow)}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setSaveOpen(true);
              setOpen(false);
            }}
          >
            <Plus /> Save current filters as a view
          </Button>
        </PopoverContent>
      </Popover>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Save current filters as a view</DialogTitle>
            <DialogDescription>Captures today's search, filters, and sort exactly as they are right now.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. My Hot Leads This Week" />
            </div>
            {canManageShared && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={saveShared} onCheckedChange={(checked) => setSaveShared(checked === true)} />
                Share with the whole organization
              </label>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleSave} loading={createView.isPending} disabled={!saveName.trim()}>
              Save View
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description={deleteTarget?.isShared ? 'This removes it for everyone in your organization.' : 'This only removes it for you.'}
        destructive
        confirmLabel="Delete View"
        loading={deleteView.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteView.mutateAsync(deleteTarget.id);
            toast.success('View deleted');
            setDeleteTarget(null);
          } catch (err) {
            toast.error(apiErrorMessage(err, 'Failed to delete view'));
          }
        }}
      />
    </>
  );
}
