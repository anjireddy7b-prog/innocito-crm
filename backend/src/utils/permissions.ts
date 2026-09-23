/**
 * Central permission registry. Each key is `<resource>:<action>`.
 * Roles are mapped to permission sets in prisma/seed.ts, and re-checked
 * at runtime by requirePermission() middleware — never trust the client.
 */
export const PERMISSIONS = {
  USERS_MANAGE: 'users:manage', // create/disable/reset password/assign roles — Admin only
  ROLES_VIEW: 'roles:view',
  // Phase 3: create/rename custom roles and edit any role's permission grants. Deliberately
  // separate from ROLES_VIEW (a role's own permission list is visible more widely — e.g. to
  // populate the user-creation role picker — than the power to change what that list grants).
  ROLES_MANAGE: 'roles:manage',
  // Phase 3: edit the organization's own profile (name/slug). Existed unused since Phase 2, which
  // gated PATCH /organizations/me with a hardcoded requireRole('ADMIN') instead — this is that
  // permission's intended home.
  ORGANIZATION_MANAGE: 'organization:manage',
  // Phase 3: edit or delete another user's comment, not just your own (previously a hardcoded
  // `role !== 'ADMIN'` check in comments.service.ts).
  COMMENTS_MANAGE_ANY: 'comments:manage_any',
  // Phase 4: create/rename/delete custom field definitions (currently LEAD-only — see
  // db/schema.ts's customFieldDefinitions table). Viewing field definitions (to render them on a
  // lead form) is covered by LEADS_VIEW/LEADS_CREATE, not gated separately — only changing the
  // definitions themselves needs this.
  CUSTOM_FIELDS_MANAGE: 'custom_fields:manage',
  // Phase 4: rename/reorder/toggle won-lost-terminal flags on pipeline stages. Creating/deleting
  // brand-new stages is out of scope this phase (see db/schema.ts's pipelineStages table comment).
  PIPELINE_STAGES_MANAGE: 'pipeline_stages:manage',
  // Phase 5: create/edit/delete tenant-defined custom object types and their records. ADMIN-only
  // by default, same precedent as CUSTOM_FIELDS_MANAGE/PIPELINE_STAGES_MANAGE — not extended to
  // any other default role this phase.
  CUSTOM_OBJECTS_MANAGE: 'custom_objects:manage',
  // Phase 7: create, edit, or delete a saved view that's marked shared (visible to the whole
  // organization, not just its creator) — see db/schema.ts's savedViews table comment. Anyone
  // holding the relevant "view" permission for a saved view's entityType (LEADS_VIEW today) can
  // always create/edit/delete their OWN personal (non-shared) views without this; this is only
  // for the org-wide ones, same "management" tier as REPORTS_EXPORT/AUDIT_LOGS_VIEW below.
  SAVED_VIEWS_MANAGE_SHARED: 'saved_views:manage_shared',
  // Phase 8: create/edit/delete tenant-defined validation rules on leads. ADMIN-only by default,
  // same precedent as CUSTOM_FIELDS_MANAGE/PIPELINE_STAGES_MANAGE/CUSTOM_OBJECTS_MANAGE — a rule
  // is pure server-side enforcement with no client-rendering audience to carve a separate "view"
  // permission out for (unlike custom fields, which every lead viewer needs the list of to render
  // the form).
  VALIDATION_RULES_MANAGE: 'validation_rules:manage',
  // Phase 9 ("advanced CRM" slice): create/edit/delete cases and their comments, and change a
  // case's status/priority/assignment. One permission for the whole module — same "management" tier
  // as COMPANIES_MANAGE/CONTACTS_MANAGE below — since a case has no separate viewing audience to
  // carve a "view" permission out for; viewing (GET /cases, GET /cases/:id) is unconditional for any
  // authenticated org member, mirroring Companies/Contacts themselves having no view-time gate.
  CASES_MANAGE: 'cases:manage',

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
    PERMISSIONS.CASES_MANAGE,
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
    PERMISSIONS.CASES_MANAGE,
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
    // Phase 9: DELIVERY owns technical/post-sale delivery, the team most likely to work support
    // cases day to day — same "operational, hands-on" tier as its existing TASKS_MANAGE/
    // MEETINGS_MANAGE grants, not the org-wide-reference-data tier COMPANIES_MANAGE/CONTACTS_MANAGE
    // sits in (which DELIVERY deliberately does NOT hold either).
    PERMISSIONS.CASES_MANAGE,
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
    PERMISSIONS.SAVED_VIEWS_MANAGE_SHARED,
  ],
};

/** The 5 role names every organization is seeded with (see utils/defaultRoles.ts). Kept as a
 * plain array of strings, not a type union — Phase 3 made role names admin-editable data, so
 * nothing in the app should assume this is the exhaustive set of roles that can ever exist. */
export const DEFAULT_ROLE_NAMES = Object.keys(ROLE_PERMISSIONS);

/** Human-readable description shown in the permission-catalog / role-editor UI. Centralized here
 * (rather than duplicated in db/seed.ts) so the GET /api/permissions route and the seed script
 * stay in sync by construction. */
export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  [PERMISSIONS.USERS_MANAGE]: 'Create users, assign roles, reset passwords, enable/disable accounts',
  [PERMISSIONS.ROLES_VIEW]: 'View roles & permissions',
  [PERMISSIONS.ROLES_MANAGE]: 'Create, rename, and delete roles; edit their permission grants',
  [PERMISSIONS.ORGANIZATION_MANAGE]: "Edit the organization's name and URL slug",
  [PERMISSIONS.COMMENTS_MANAGE_ANY]: "Edit or delete any user's comment, not just your own",
  [PERMISSIONS.CUSTOM_FIELDS_MANAGE]: 'Create, rename, and delete custom fields on leads',
  [PERMISSIONS.PIPELINE_STAGES_MANAGE]: 'Rename, reorder, and edit pipeline stage flags',
  [PERMISSIONS.CUSTOM_OBJECTS_MANAGE]: 'Create, edit, and delete custom object types and their records',
  [PERMISSIONS.SAVED_VIEWS_MANAGE_SHARED]: 'Create, edit, and delete shared (organization-wide) saved views',
  [PERMISSIONS.VALIDATION_RULES_MANAGE]: 'Create, edit, and delete validation rules on leads',
  [PERMISSIONS.CASES_MANAGE]: 'Create, edit, and delete cases and case comments; change case status, priority, and assignment',
  [PERMISSIONS.LEADS_CREATE]: 'Create new leads',
  [PERMISSIONS.LEADS_VIEW]: 'View leads',
  [PERMISSIONS.LEADS_EDIT_OWN]: 'Edit leads you are assigned to / own / created',
  [PERMISSIONS.LEADS_EDIT_ANY]: 'Edit any lead regardless of ownership',
  [PERMISSIONS.LEADS_DELETE]: 'Delete (deactivate) leads',
  [PERMISSIONS.LEADS_ASSIGN]: 'Assign leads to Sales/Delivery reps',
  [PERMISSIONS.COMPANIES_MANAGE]: 'Create/edit/delete companies',
  [PERMISSIONS.CONTACTS_MANAGE]: 'Create/edit/delete contacts',
  [PERMISSIONS.CAMPAIGNS_MANAGE]: 'Create/edit/delete campaigns',
  [PERMISSIONS.MEETINGS_MANAGE]: 'Schedule and update meetings, record MoM',
  [PERMISSIONS.TASKS_MANAGE]: 'Create and update tasks',
  [PERMISSIONS.DOCUMENTS_UPLOAD]: 'Upload documents',
  [PERMISSIONS.DOCUMENTS_DELETE]: 'Delete documents',
  [PERMISSIONS.COMMENTS_CREATE]: 'Add comments to leads',
  [PERMISSIONS.REPORTS_VIEW]: 'View reports',
  [PERMISSIONS.REPORTS_EXPORT]: 'Export reports to CSV/Excel/PDF',
  [PERMISSIONS.DASHBOARD_VIEW]: 'View the KPI dashboard',
  [PERMISSIONS.AUDIT_LOGS_VIEW]: 'View the security audit log',
  [PERMISSIONS.SETTINGS_MANAGE]: 'Manage system settings',
};

/** Description seeded onto each organization's own copy of the 5 default roles. Editable
 * afterward (like everything else about a role, post-Phase 3) — this is only the starting text. */
export const DEFAULT_ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: 'Full system access — manages users, roles, and all data',
  INSIDE_SALES: 'Creates and qualifies leads, schedules first meetings, assigns to Sales/Delivery',
  SALES: 'Owns the sales cycle: meetings, proposals, negotiation, close',
  DELIVERY: 'Owns technical delivery: demos, technical validation, handoff',
  MANAGEMENT: 'Cross-team visibility, reporting, and analytics',
};
