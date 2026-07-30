/**
 * Central permission registry. Each key is `<resource>:<action>`.
 * Roles are mapped to permission sets in prisma/seed.ts, and re-checked
 * at runtime by requirePermission() middleware — never trust the client.
 */
export const PERMISSIONS = {
  USERS_MANAGE: 'users:manage', // create/disable/reset password/assign roles — Admin only
  ROLES_VIEW: 'roles:view',

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

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

/** Role -> permission map used by the seed script to populate role_permissions. */
export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  ADMIN: ALL_PERMISSIONS,
  INSIDE_SALES: [
    PERMISSIONS.LEADS_CREATE,
    PERMISSIONS.LEADS_VIEW,
    PERMISSIONS.LEADS_EDIT_OWN,
    PERMISSIONS.LEADS_ASSIGN,
    PERMISSIONS.COMPANIES_MANAGE,
    PERMISSIONS.CONTACTS_MANAGE,
    PERMISSIONS.CAMPAIGNS_MANAGE,
    PERMISSIONS.MEETINGS_MANAGE,
    PERMISSIONS.TASKS_MANAGE,
    PERMISSIONS.DOCUMENTS_UPLOAD,
    PERMISSIONS.COMMENTS_CREATE,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],
  SALES: [
    PERMISSIONS.LEADS_VIEW,
    PERMISSIONS.LEADS_EDIT_OWN,
    PERMISSIONS.MEETINGS_MANAGE,
    PERMISSIONS.TASKS_MANAGE,
    PERMISSIONS.DOCUMENTS_UPLOAD,
    PERMISSIONS.COMMENTS_CREATE,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],
  DELIVERY: [
    PERMISSIONS.LEADS_VIEW,
    PERMISSIONS.LEADS_EDIT_OWN,
    PERMISSIONS.MEETINGS_MANAGE,
    PERMISSIONS.TASKS_MANAGE,
    PERMISSIONS.DOCUMENTS_UPLOAD,
    PERMISSIONS.COMMENTS_CREATE,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.REPORTS_VIEW,
  ],
  MANAGEMENT: [
    PERMISSIONS.LEADS_VIEW,
    PERMISSIONS.COMPANIES_MANAGE,
    PERMISSIONS.CONTACTS_MANAGE,
    PERMISSIONS.CAMPAIGNS_MANAGE,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.AUDIT_LOGS_VIEW,
  ],
};
