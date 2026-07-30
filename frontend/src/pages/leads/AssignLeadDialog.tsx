import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { UserPicker } from '@/components/shared/UserPicker';
import { useAssignLead } from '@/api/leads';
import { apiErrorMessage } from '@/lib/api';
import type { Lead } from '@/types';

export function AssignLeadDialog({ lead, open, onOpenChange }: { lead: Lead; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [assignedToId, setAssignedToId] = useState<string | null>(lead.assignedToId);
  const [currentOwnerId, setCurrentOwnerId] = useState<string | null>(lead.currentOwnerId);
  const [note, setNote] = useState('');
  const assignLead = useAssignLead(lead.id);

  async function handleSave() {
    try {
      await assignLead.mutateAsync({ assignedToId, currentOwnerId, note: note || undefined });
      toast.success('Lead assignment updated');
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to update assignment'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Assign Lead</DialogTitle>
          <DialogDescription>Route this lead to the Inside Sales rep and/or the Sales or Delivery owner driving the deal.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Inside Sales Rep</Label>
            <UserPicker value={assignedToId} onChange={setAssignedToId} roles={['INSIDE_SALES', 'ADMIN']} />
          </div>
          <div className="space-y-1.5">
            <Label>Current Owner (Sales / Delivery)</Label>
            <UserPicker value={currentOwnerId} onChange={setCurrentOwnerId} roles={['SALES', 'DELIVERY', 'ADMIN']} />
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for reassignment…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} loading={assignLead.isPending}>Save Assignment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
