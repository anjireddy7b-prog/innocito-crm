/** Mirrors backend/src/utils/permissions.ts — kept in sync manually since this is a small internal app. */
export const PERMISSIONS = {
  USERS_MANAGE: 'users:manage',
  ROLES_VIEW: 'roles:view',
  ROLES_MANAGE: 'roles:manage',
  ORGANIZATION_MANAGE: 'organization:manage',
  COMMENTS_MANAGE_ANY: 'comments:manage_any',
  CUSTOM_FIELDS_MANAGE: 'custom_fields:manage',
  PIPELINE_STAGES_MANAGE: 'pipeline_stages:manage',
  CUSTOM_OBJECTS_MANAGE: 'custom_objects:manage',
  SAVED_VIEWS_MANAGE_SHARED: 'saved_views:manage_shared',
  VALIDATION_RULES_MANAGE: 'validation_rules:manage',

  LEADS_CREATE: 'leads:create',
  LEADS_VIEW: 'leads:view',
  LEADS_EDIT_OWN: 'leads:edit_own',
  LEADS_EDIT_ANY: 'leads:edit_any',
  LEADS_DELETE: 'leads:delete',
  LEADS_ASSIGN: 'leads:assign',

  COMPANIES_MANAGE: 'companies:manage',
  CONTACTS_MANAGE: 'contacts:manage',
  CAMPAIGNS_MANAGE: 'campaigns:manage',

  MEETINGS_MANAGE: 'meetings:manage',
  TASKS_MANAGE: 'tasks:manage',
  DOCUMENTS_UPLOAD: 'documents:upload',
  DOCUMENTS_DELETE: 'documents:delete',
  COMMENTS_CREATE: 'comments:create',

  REPORTS_VIEW: 'reports:view',
  REPORTS_EXPORT: 'reports:export',
  DASHBOARD_VIEW: 'dashboard:view',

  AUDIT_LOGS_VIEW: 'audit_logs:view',
  SETTINGS_MANAGE: 'settings:manage',
} as const;
