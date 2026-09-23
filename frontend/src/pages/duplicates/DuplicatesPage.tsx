import { useState } from 'react';
import { GitMerge } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { humanizeEnum } from '@/lib/utils';
import {
  useDuplicateGroups,
  type DuplicateEntityType,
  type DuplicateGroup,
  type DuplicateCompanyRecord,
  type DuplicateContactRecord,
} from '@/api/duplicates';
import { MergeGroupDialog } from './MergeGroupDialog';

type AnyRecord = DuplicateCompanyRecord & Partial<DuplicateContactRecord>;

function GroupCard({
  group,
  entityType,
  canManage,
  onMerge,
}: {
  group: DuplicateGroup<AnyRecord>;
  entityType: DuplicateEntityType;
  canManage: boolean;
  onMerge: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            {group.matchedOn.map((m) => (
              <Badge key={m} variant="outline">
                Matched on {humanizeEnum(m)}
              </Badge>
            ))}
            <Badge variant="secondary">{group.records.length} records</Badge>
          </div>
          {canManage && (
            <Button size="sm" variant="outline" onClick={onMerge}>
              <GitMerge className="h-3.5 w-3.5" /> Review & Merge
            </Button>
          )}
        </div>
        <div className="space-y-1.5">
          {group.records.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">
                {entityType === 'COMPANY' ? r.name : `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim()}
              </span>
              <span className="text-xs text-muted-foreground">
                {entityType === 'COMPANY'
                  ? r.domain || r.website || '—'
                  : r.email || r.phone || '—'}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DuplicatesTab({ entityType, canManage }: { entityType: DuplicateEntityType; canManage: boolean }) {
  const { data: groups, isLoading } = useDuplicateGroups<AnyRecord>(entityType);
  const [mergeGroup, setMergeGroup] = useState<DuplicateGroup<AnyRecord> | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
      </div>
    );
  }

  if (!groups?.length) {
    return (
      <EmptyState
        title="No duplicates found"
        description={`No two ${entityType === 'COMPANY' ? 'companies' : 'contacts'} in your organization currently share a ${entityType === 'COMPANY' ? 'name or domain' : 'email or phone number'}.`}
      />
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((g, i) => (
        <GroupCard key={i} group={g} entityType={entityType} canManage={canManage} onMerge={() => setMergeGroup(g)} />
      ))}
      <MergeGroupDialog group={mergeGroup} entityType={entityType} open={!!mergeGroup} onOpenChange={(o) => !o && setMergeGroup(null)} />
    </div>
  );
}

/**
 * Phase 9 ("advanced CRM" slice — duplicate detection & merge). Detection is computed fresh on
 * every visit (no persisted candidate table — see the backend's duplicates.service.ts), scoped to
 * Companies and Contacts only; Leads are deliberately excluded (see that same file's comment).
 * Open to any authenticated user, same as the Accounts/Contacts pages themselves — merging is
 * gated on the same COMPANIES_MANAGE/CONTACTS_MANAGE permission that already gates deleting that
 * entity type, so the "Review & Merge" action simply doesn't render without it.
 */
export default function DuplicatesPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Duplicates"
        description="Find and merge companies or contacts that likely represent the same real-world record."
      />
      <Tabs defaultValue="companies">
        <TabsList>
          <TabsTrigger value="companies">Companies</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
        </TabsList>
        <TabsContent value="companies">
          <DuplicatesTab entityType="COMPANY" canManage={hasPermission(PERMISSIONS.COMPANIES_MANAGE)} />
        </TabsContent>
        <TabsContent value="contacts">
          <DuplicatesTab entityType="CONTACT" canManage={hasPermission(PERMISSIONS.CONTACTS_MANAGE)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
