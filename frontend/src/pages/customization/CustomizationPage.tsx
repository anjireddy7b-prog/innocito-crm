import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { CustomFieldsTab } from './CustomFieldsTab';
import { PipelineStagesTab } from './PipelineStagesTab';
import { CustomObjectsTab } from './CustomObjectsTab';
import { ValidationRulesTab } from './ValidationRulesTab';

/**
 * Phase 4: the customization engine's admin surface — custom field definitions (LEAD-only for
 * now) and pipeline-stage metadata. Reached via the sidebar and gated on CUSTOM_FIELDS_MANAGE at
 * the route level (see App.tsx) since both permissions are granted together to ADMIN by default
 * and no other default role has either; within the page, each tab's edit affordances additionally
 * check their own specific permission so a future role that's granted only one of the two still
 * sees a consistent, edit-appropriate view.
 *
 * Phase 5: added a third tab for tenant-defined custom objects, gated on its own
 * CUSTOM_OBJECTS_MANAGE permission (also ADMIN-only by default, so the route-level gate below
 * still covers it without changes).
 *
 * Phase 8: added a fourth tab for LEAD-only validation rules, gated on its own
 * VALIDATION_RULES_MANAGE permission (also ADMIN-only by default — same simplification as the
 * other tabs' own permissions).
 */
export default function CustomizationPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customization"
        description="Add extra fields to leads, define custom objects, and adjust how your pipeline stages are labeled and grouped."
      />

      <Tabs defaultValue="fields">
        <TabsList>
          <TabsTrigger value="fields">Custom Fields</TabsTrigger>
          <TabsTrigger value="objects">Custom Objects</TabsTrigger>
          <TabsTrigger value="validationRules">Validation Rules</TabsTrigger>
          <TabsTrigger value="stages">Pipeline Stages</TabsTrigger>
        </TabsList>
        <TabsContent value="fields">
          <CustomFieldsTab canManage={hasPermission(PERMISSIONS.CUSTOM_FIELDS_MANAGE)} />
        </TabsContent>
        <TabsContent value="objects">
          <CustomObjectsTab canManage={hasPermission(PERMISSIONS.CUSTOM_OBJECTS_MANAGE)} />
        </TabsContent>
        <TabsContent value="validationRules">
          <ValidationRulesTab canManage={hasPermission(PERMISSIONS.VALIDATION_RULES_MANAGE)} />
        </TabsContent>
        <TabsContent value="stages">
          <PipelineStagesTab canManage={hasPermission(PERMISSIONS.PIPELINE_STAGES_MANAGE)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
