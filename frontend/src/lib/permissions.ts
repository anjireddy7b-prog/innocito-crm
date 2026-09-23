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
  CASES_MANAGE: 'cases:manage',
  KNOWLEDGE_BASE_MANAGE: 'knowledge_base:manage',
  // Phase 9 ("advanced CRM" slice) — sequences, Stage 2. Unlike CASES_MANAGE/KNOWLEDGE_BASE_MANAGE
  // above, this gates the ENTIRE module including viewing — sequence step content is outreach
  // copy authored for enrolling leads, not org-wide reference material. Granted by default only
  // to INSIDE_SALES and SALES (see backend/src/utils/permissions.ts).
  SEQUENCES_MANAGE: 'sequences:manage',
  // Phase 10 (reporting/dashboard builder), slice 1 — see backend/src/utils/permissions.ts's
  // own comment for the full rationale (same "management tier" as SAVED_VIEWS_MANAGE_SHARED).
  REPORTS_MANAGE_SHARED: 'reports:manage_shared',

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

  // Phase 11 (API/integrations), slice 1 — mirrors backend/src/utils/permissions.ts.
  API_KEYS_MANAGE: 'api_keys:manage',
  // Phase 11 (API/integrations), slice 2 — mirrors backend/src/utils/permissions.ts.
  WEBHOOKS_MANAGE: 'webhooks:manage',
  // Phase 11 (API/integrations), slice 3 — mirrors backend/src/utils/permissions.ts.
  CONNECTORS_MANAGE: 'connectors:manage',
  // Phase 12 (billing/subscriptions) — mirrors backend/src/utils/permissions.ts.
  BILLING_MANAGE: 'billing:manage',
} as const;
