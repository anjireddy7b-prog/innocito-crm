import { useState } from 'react';
import { toast } from 'sonner';
import { Search, UserPlus, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { useLeads } from '@/api/leads';
import { useEnrollLead } from '@/api/sequences';
import { apiErrorMessage } from '@/lib/api';

// No dedicated LeadPicker component exists yet elsewhere in the app (UserPicker is the only
// picker, and it's a plain <Select> — unsuitable here since the org's full lead list can be
// large). This is a small search-as-you-type list instead, reusing useLeads the same way
// CaseFormDialog.tsx reuses useCompanies/useContacts for its own pickers.
export function EnrollLeadDialog({ sequenceId, open, onOpenChange }: { sequenceId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useLeads({ page: 1, pageSize: 8, search: search || undefined, sortBy: 'leadReceivedDate', sortDir: 'desc' });
  const enrollLead = useEnrollLead(sequenceId);

  async function handleEnroll(leadId: string) {
    try {
      await enrollLead.mutateAsync(leadId);
      toast.success('Lead enrolled');
      onOpenChange(false);
      setSearch('');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to enroll lead'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setSearch(''); }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Enroll a Lead</DialogTitle>
          <DialogDescription>Search for a lead to enroll. The lead needs a linked contact with an email address.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus placeholder="Search leads by company or contact…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}

          {!isLoading && data?.data.length === 0 && (
            <EmptyState title="No leads found" description="Try a different search term." />
          )}

          {!isLoading &&
            data?.data.map((lead) => {
              const email = lead.contact?.email;
              return (
                <div key={lead.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{lead.company?.name ?? lead.displayId}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {lead.contact ? `${lead.contact.firstName} ${lead.contact.lastName}` : 'No linked contact'}
                      {email ? ` · ${email}` : ''}
                    </p>
                    {!email && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" /> No contact email — can't be enrolled
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!email}
                    loading={enrollLead.isPending}
                    onClick={() => handleEnroll(lead.id)}
                  >
                    <UserPlus /> Enroll
                  </Button>
                </div>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
