import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { useCustomObjectDefinition } from '@/api/customObjects';
import { CustomFieldsTab } from '@/pages/customization/CustomFieldsTab';
import { CustomObjectRecordsTab } from './CustomObjectRecordsTab';

/**
 * Phase 5: a single custom object's own management surface — its field definitions (reusing the
 * exact CustomFieldsTab built for leads in Phase 4, parameterized with this object's own `key` as
 * entityType) and its records. Reached from the Customization page's "Custom Objects" tab.
 */
export default function CustomObjectDetailPage() {
  const { definitionId } = useParams<{ definitionId: string }>();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.CUSTOM_OBJECTS_MANAGE);
  const { data: definition, isLoading, isError } = useCustomObjectDefinition(definitionId);
  const [tab, setTab] = useState('records');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (isError || !definition) {
    return <EmptyState title="Custom object not found" description="It may have been deleted." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/customization" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Customization
        </Link>
      </div>

      <PageHeader title={definition.pluralLabel} description={definition.description ?? `Manage ${definition.pluralLabel.toLowerCase()} fields and records.`} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="records">Records</TabsTrigger>
          <TabsTrigger value="fields">Fields</TabsTrigger>
        </TabsList>
        <TabsContent value="records">
          <CustomObjectRecordsTab definition={definition} canManage={canManage} onManageFields={() => setTab('fields')} />
        </TabsContent>
        <TabsContent value="fields">
          <CustomFieldsTab canManage={canManage} entityType={definition.key} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
