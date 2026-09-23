// ============================================================================
// Innocito Internal Lead Management CRM — PostgreSQL schema (Drizzle ORM)
// UUID primary keys, normalized relations, indexed for search/filter/sort.
// ============================================================================
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ----------------------------------------------------------------------------
// Enums
// ----------------------------------------------------------------------------
export const leadSourceEnum = pgEnum('lead_source', [
  'EMAIL', 'LINKEDIN', 'COLD_CALLING', 'REFERRAL', 'WEBSITE', 'EVENT', 'PARTNER', 'OTHER',
]);
export const leadStatusEnum = pgEnum('lead_status', [
  'NEW', 'CONTACTED', 'QUALIFIED', 'MEETING_SCHEDULED', 'MEETING_DONE', 'DEMO_SCHEDULED',
  'DEMO_DONE', 'PROPOSAL_SENT', 'NEGOTIATION', 'ON_HOLD', 'WON', 'LOST', 'DISQUALIFIED',
]);
export const leadPriorityEnum = pgEnum('lead_priority', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const meetingTypeEnum = pgEnum('meeting_type', ['DISCOVERY', 'DEMO', 'FOLLOW_UP', 'TECHNICAL', 'NEGOTIATION', 'CLOSING', 'OTHER']);
export const meetingStatusEnum = pgEnum('meeting_status', ['SCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED', 'RESCHEDULED']);
export const taskStatusEnum = pgEnum('task_status', ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED']);
export const taskPriorityEnum = pgEnum('task_priority', ['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const documentTypeEnum = pgEnum('document_type', ['PROPOSAL', 'MOM', 'PRESENTATION', 'CONTRACT', 'BROCHURE', 'OTHER']);
export const activityTypeEnum = pgEnum('activity_type', [
  'LEAD_CREATED', 'LEAD_UPDATED', 'LEAD_ASSIGNED', 'LEAD_REASSIGNED', 'STATUS_CHANGED',
  'MEETING_SCHEDULED', 'MEETING_UPDATED', 'MEETING_COMPLETED', 'COMMENT_ADDED', 'DOCUMENT_UPLOADED',
  'TASK_CREATED', 'TASK_COMPLETED', 'FOLLOW_UP_LOGGED', 'CALL_LOGGED', 'EMAIL_LOGGED', 'MOM_ADDED', 'OTHER',
]);
export const notificationTypeEnum = pgEnum('notification_type', [
  'LEAD_ASSIGNED', 'MEETING_REMINDER', 'TASK_DUE', 'TASK_OVERDUE', 'FOLLOW_UP_OVERDUE',
  'STATUS_CHANGED', 'COMMENT_MENTION', 'DOCUMENT_UPLOADED', 'SYSTEM',
]);
export const auditActionEnum = pgEnum('audit_action', [
  'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_RESET',
  'ROLE_CHANGED', 'STATUS_CHANGED', 'ASSIGNMENT_CHANGED', 'EXPORT', 'EMAIL_CHANGED',
  // Phase 9: duplicate-detection merge (companies/contacts) — see modules/duplicates/duplicates.service.ts.
  'MERGE',
]);
// Phase 4: custom fields engine. `entityType` on custom_field_definitions is schema-generic
// (varchar, not an enum limited to LEAD) so a future phase can extend to companies/contacts
// without a migration — but MVP scope only validates/renders 'LEAD' (see
// customFields.validation.ts and the frontend CustomFieldsSection component).
export const customFieldTypeEnum = pgEnum('custom_field_type', [
  'TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTI_SELECT',
]);

// ----------------------------------------------------------------------------
// Multi-tenancy
// ----------------------------------------------------------------------------
// Phase 1 of the SaaS migration: every tenant-scoped table below carries an
// `organizationId` column, enforced by the shared query-scoping guard in
// utils/tenant.ts. This table is intentionally minimal for Phase 1 — dynamic
// per-organization RBAC, billing/plan fields, and feature flags are later
// phases (see the Architecture Report) and are NOT added here so this step
// stays a pure, low-risk "add tenancy" change.
export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('organizations_is_active_idx').on(t.isActive)]
);

// ----------------------------------------------------------------------------
// Identity / Access
// ----------------------------------------------------------------------------
// Phase 3 (see migrations 0011-0013 and the Architecture Report): `roles` moved from a single
// global, hardcoded catalog (5 fixed enum values, shared by every organization on the platform)
// to tenant-scoped, admin-editable data. `organizationId` is NOT NULL and unique per (org, name)
// — every organization owns its own independent set of role rows, seeded from the same 5
// defaults but freely rename-able, deletable, and extensible with custom roles from here on.
// `name` is plain text rather than the old `role_name` enum for exactly that reason: an Admin can
// create a role called "Team Lead" that the database schema was never told about in advance.
export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('roles_org_idx').on(t.organizationId), uniqueIndex('roles_org_name_unique').on(t.organizationId, t.name)]
);

export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })]
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Every existing row was backfilled onto a seeded default organization before this was made
    // NOT NULL (Phase 1 steps 1-3 — see db/migrations/0006_.../0007_.../0008_... and the
    // Architecture Report's Migration Plan).
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    phone: varchar('phone', { length: 30 }),
    jobTitle: varchar('job_title', { length: 150 }),
    avatarUrl: text('avatar_url'),
    roleId: uuid('role_id').notNull().references(() => roles.id),
    isActive: boolean('is_active').notNull().default(true),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    lastLoginAt: timestamp('last_login_at'),
    createdById: uuid('created_by_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('users_role_id_idx').on(t.roleId),
    index('users_is_active_idx').on(t.isActive),
    index('users_org_idx').on(t.organizationId),
    index('users_org_email_idx').on(t.organizationId, t.email),
  ]
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 64 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('refresh_tokens_user_id_idx').on(t.userId)]
);

// ----------------------------------------------------------------------------
// Core CRM entities
// ----------------------------------------------------------------------------
export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    name: varchar('name', { length: 255 }).notNull(),
    domain: varchar('domain', { length: 255 }),
    website: varchar('website', { length: 255 }),
    industry: varchar('industry', { length: 150 }),
    companySize: varchar('company_size', { length: 50 }),
    annualRevenue: numeric('annual_revenue', { precision: 14, scale: 2 }),
    phone: varchar('phone', { length: 30 }),
    addressLine: varchar('address_line', { length: 255 }),
    city: varchar('city', { length: 120 }),
    state: varchar('state', { length: 120 }),
    country: varchar('country', { length: 120 }),
    postalCode: varchar('postal_code', { length: 20 }),
    linkedinUrl: varchar('linkedin_url', { length: 255 }),
    notes: text('notes'),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('companies_name_idx').on(t.name),
    index('companies_domain_idx').on(t.domain),
    index('companies_country_idx').on(t.country),
    index('companies_org_idx').on(t.organizationId),
    index('companies_org_created_idx').on(t.organizationId, t.createdAt),
  ]
);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    firstName: varchar('first_name', { length: 150 }).notNull(),
    lastName: varchar('last_name', { length: 150 }).notNull(),
    designation: varchar('designation', { length: 200 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 30 }),
    linkedinUrl: varchar('linkedin_url', { length: 255 }),
    city: varchar('city', { length: 120 }),
    state: varchar('state', { length: 120 }),
    country: varchar('country', { length: 120 }),
    isPrimary: boolean('is_primary').notNull().default(false),
    notes: text('notes'),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('contacts_company_id_idx').on(t.companyId),
    index('contacts_email_idx').on(t.email),
    index('contacts_name_idx').on(t.lastName, t.firstName),
    index('contacts_org_idx').on(t.organizationId),
    index('contacts_org_email_idx').on(t.organizationId, t.email),
  ]
);

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    name: varchar('name', { length: 200 }).notNull(),
    code: varchar('code', { length: 20 }),
    description: text('description'),
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
    startDate: timestamp('start_date'),
    endDate: timestamp('end_date'),
    budget: numeric('budget', { precision: 12, scale: 2 }),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('campaigns_status_idx').on(t.status),
    index('campaigns_org_idx').on(t.organizationId),
    // Phase 2: narrowed from a platform-wide unique `code` (Phase 1's deliberate, documented
    // deferral — see the Architecture Report's Section L) to unique-per-organization, now that
    // self-service org signup (Phase 2) means a second real organization can actually exist and
    // would otherwise collide with the first org's campaign codes ("Q1", "SPRING24", etc.). NULL
    // codes are unaffected — Postgres treats each NULL as distinct in a unique index, exactly as
    // the old column-level constraint already did.
    uniqueIndex('campaigns_org_code_unique').on(t.organizationId, t.code),
  ]
);

// ----------------------------------------------------------------------------
// Customization engine (Phase 4) — custom fields + configurable pipeline stages
// ----------------------------------------------------------------------------
// Tenant-scoped definitions of admin-defined extra fields. Values themselves live in a JSONB
// `customFields` column on the entity table (see `leads.customFields` below) rather than an
// EAV value table — chosen over EAV because every consumer of a lead already fetches the whole
// row in one query (no per-field joins needed), the value set per lead is small, and Postgres
// JSONB indexing/containment queries are sufficient for this app's filtering needs. This is
// purely additive: existing typed columns on `leads` remain the source of truth for every
// current field, and `customFields` only ever holds admin-defined extras layered on top.
export const customFieldDefinitions = pgTable(
  'custom_field_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    // 'LEAD' or a tenant-defined custom object's own `key` (see customObjectDefinitions) — Phase 5
    // generalized this from the original LEAD-only MVP; see customFields.validation.ts's
    // entityTypeSchema.
    entityType: varchar('entity_type', { length: 50 }).notNull().default('LEAD'),
    key: varchar('key', { length: 100 }).notNull(),
    label: varchar('label', { length: 200 }).notNull(),
    fieldType: customFieldTypeEnum('field_type').notNull(),
    // Choice list for SELECT/MULTI_SELECT, e.g. ["Small","Medium","Large"]. Null for other types.
    options: jsonb('options'),
    required: boolean('required').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    // Phase 6 (dynamic forms/layouts): an optional named group this field renders under on its
    // form (e.g. "Contact Preferences"), purely additive — null (the default, and every field
    // that existed before this column) renders exactly as before: one flat, unlabeled group. See
    // CustomFieldsSection.tsx for the grouping/render logic. Deliberately a plain string per field
    // rather than a separate section-ordering table, matching this codebase's existing pattern for
    // SELECT/MULTI_SELECT `options` (also a plain per-field list, not its own catalog table).
    section: varchar('section', { length: 150 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('custom_field_definitions_org_idx').on(t.organizationId),
    uniqueIndex('custom_field_definitions_org_entity_key_unique').on(t.organizationId, t.entityType, t.key),
  ]
);

// Tenant-scoped, admin-editable metadata mirroring the current hardcoded `lead_status` enum.
// This phase seeds one row per org per existing enum value (see utils/defaultPipelineStages.ts)
// and exposes them for renaming/reordering/toggling flags — `leads.status` itself is
// deliberately NOT cut over to be driven by this table yet (that would require changing the
// column's type from an enum to a free-text key referencing this table, plus updating every
// place that branches on a specific status string). Creating/deleting brand-new stages is out
// of scope for this phase for the same reason; this is a documented, deliberate scope limit —
// see the Architecture Report's Phase 4 completion section.
export const pipelineStages = pgTable(
  'pipeline_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    // Mirrors a `lead_status` enum value (e.g. "MEETING_SCHEDULED") — not itself an enum, since
    // future phases may allow custom keys once leads.status is cut over.
    key: varchar('key', { length: 100 }).notNull(),
    label: varchar('label', { length: 150 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isWon: boolean('is_won').notNull().default(false),
    isLost: boolean('is_lost').notNull().default(false),
    isTerminal: boolean('is_terminal').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('pipeline_stages_org_idx').on(t.organizationId),
    uniqueIndex('pipeline_stages_org_key_unique').on(t.organizationId, t.key),
  ]
);

// ----------------------------------------------------------------------------
// Customization engine, part 2 (Phase 5) — custom objects
// ----------------------------------------------------------------------------
// Per the Architecture Report's Section H ("Custom objects follow as a further-out phase:
// tenant-defined entities with their own schema-lite definition, reusing the same
// field-definition engine") and Section K's superseding 15-phase breakdown (Phase 5 = custom
// objects, split out from Phase 4's custom fields). A custom object is a brand-new, tenant-
// defined entity with NO typed columns of its own — every field on it is a row in
// `customFieldDefinitions` with `entityType` set to this object's own `key` (reusing that table
// and its validation/storage engine exactly as-is, with zero changes needed there: entityType was
// already schema-generic, only ever UI/validation-restricted to 'LEAD'). `key` is reserved
// against 'LEAD' (and any other future built-in entity type) in customObjects.validation.ts so a
// custom object can never shadow a real one.
export const customObjectDefinitions = pgTable(
  'custom_object_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    // Doubles as the `entityType` value on this object's own custom_field_definitions rows.
    key: varchar('key', { length: 100 }).notNull(),
    singularLabel: varchar('singular_label', { length: 150 }).notNull(),
    pluralLabel: varchar('plural_label', { length: 150 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('custom_object_definitions_org_idx').on(t.organizationId),
    uniqueIndex('custom_object_definitions_org_key_unique').on(t.organizationId, t.key),
  ]
);

// A record of a custom object. Unlike `leads.customFields` (a JSONB bag layered ALONGSIDE typed
// columns that remain the source of truth), a custom object has no typed columns at all — `data`
// is the entire record. Still JSONB rather than EAV rows for the same reasons documented on
// `customFieldDefinitions` above: one query per record, small field counts, no join fan-out.
export const customObjectRecords = pgTable(
  'custom_object_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    objectDefinitionId: uuid('object_definition_id').notNull().references(() => customObjectDefinitions.id, { onDelete: 'cascade' }),
    data: jsonb('data').notNull().default(sql`'{}'::jsonb`),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('custom_object_records_org_idx').on(t.organizationId),
    index('custom_object_records_definition_idx').on(t.objectDefinitionId),
  ]
);

// ----------------------------------------------------------------------------
// Customization engine, part 3 (Phase 7) — saved views + custom object nav
// ----------------------------------------------------------------------------
// Section K's Phase 7 is "custom views/nav." The "nav" half needed no new table at all: every
// custom-objects route (Phase 5) is already gated behind a single CUSTOM_OBJECTS_MANAGE
// permission with no separate "view" tier (see customObjects.routes.ts's own comment), so the
// sidebar simply grows one nav item per organization's custom object definitions, gated on that
// same permission — see Sidebar.tsx. The "views" half is this table: a saved filter/sort preset
// for a list page, deliberately scoped to `entityType = 'LEAD'` only for now (the only list page
// with a rich multi-filter UI worth saving) — the same LEAD-only-first, generalize-later precedent
// `customFieldDefinitions` set in Phase 4 before Phase 5 needed it for custom objects.
export const savedViews = pgTable(
  'saved_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    // 'LEAD' today; kept as a plain string (not an enum) for the same reason
    // `customFieldDefinitions.entityType` is — so a future entity (or a custom object) can adopt
    // saved views without a schema change.
    entityType: varchar('entity_type', { length: 50 }).notNull().default('LEAD'),
    name: varchar('name', { length: 150 }).notNull(),
    // Personal (default): visible only to its creator. Shared: visible to the whole
    // organization — creating or editing one requires SAVED_VIEWS_MANAGE_SHARED, not just
    // ownership, so a team's shared views stay collectively maintained (see
    // savedViews.service.ts). No onDelete override on createdById, mirroring
    // customObjectRecords.createdById above — this app deactivates users rather than hard-deleting
    // them, so a dangling reference here would indicate a data-integrity bug worth surfacing, not
    // a case to silently null out.
    isShared: boolean('is_shared').notNull().default(false),
    createdById: uuid('created_by_id').references(() => users.id),
    // The list page's own query-string params (search/status/source/priority/assignedToId/
    // sdrId/createdBySdrId/industry/country/sortBy/sortDir for LEAD today) as a plain JSON object
    // — applied by simply re-seeding the URLSearchParams the list page already drives its query
    // off of (see LeadsListPage.tsx), so this stores exactly the shape it will be replayed into.
    filters: jsonb('filters').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('saved_views_org_entity_idx').on(t.organizationId, t.entityType),
    // Scoped to (org, entityType, creator, name) — prevents one user from saving two views of
    // the same name, personal or shared. Deliberately does NOT also prevent two different users
    // from independently naming their own shared views identically; that's a minor cosmetic
    // collision, not a data-integrity one, and resolving it would need a separate "shared views
    // have no single owner" model this phase doesn't need.
    uniqueIndex('saved_views_org_entity_creator_name_unique').on(t.organizationId, t.entityType, t.createdById, t.name),
  ]
);

// ----------------------------------------------------------------------------
// Process engines, part 1 (Phase 8) — validation rules
// ----------------------------------------------------------------------------
// Section H groups "workflow / approval / validation-rule / notification engines" as one
// net-new subsystem needing a job queue (Redis gains a queue role, e.g. BullMQ) and
// feature-flag-gated rollout. This phase deliberately implements only the validation-rule slice,
// synchronously, with NO queue — see the Architecture Report's Phase 8 completion section for why
// true async workflow automation and approvals (which genuinely need that queue/notification
// infrastructure) are deferred: introducing a background-job worker is a materially larger,
// riskier undertaking on this app's current single-service Railway deployment than this phase's
// own budget, the same class of judgment call Phase 6 made about the built-in Lead form.
//
// A rule is "when <field> <operator> [value], then <fields> are required" — evaluated
// synchronously against a lead's fully-merged field values (typed columns plus its `customFields`
// bag) on every create/update, before the row is written (see leads.service.ts and
// validationRules.service.ts's enforceValidationRules). `entityType` is LEAD-only for now, same
// LEAD-only-first precedent as customFieldDefinitions/savedViews.
export const validationRules = pgTable(
  'validation_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    entityType: varchar('entity_type', { length: 50 }).notNull().default('LEAD'),
    name: varchar('name', { length: 150 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    // A typed Lead column name (e.g. "status", "dealValue") or a custom field key — resolved
    // generically at evaluation time (see validationRules.service.ts's getFieldValue), not
    // constrained to a fixed enum here, so a rule can reference either without a schema change.
    whenField: varchar('when_field', { length: 100 }).notNull(),
    whenOperator: varchar('when_operator', { length: 20 }).notNull(),
    // Required for 'equals'/'not_equals', unused (and left null) for 'is_set'/'is_not_set' — see
    // validationRules.validation.ts's superRefine.
    whenValue: varchar('when_value', { length: 255 }),
    // string[] of field keys that must be non-empty when the condition matches.
    thenRequireFields: jsonb('then_require_fields').notNull().default(sql`'[]'::jsonb`),
    errorMessage: varchar('error_message', { length: 500 }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('validation_rules_org_entity_idx').on(t.organizationId, t.entityType),
    uniqueIndex('validation_rules_org_entity_name_unique').on(t.organizationId, t.entityType, t.name),
  ]
);

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    leadNumber: integer('lead_number').notNull().unique().generatedAlwaysAsIdentity(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),

    source: leadSourceEnum('source').notNull().default('OTHER'),
    status: leadStatusEnum('status').notNull().default('NEW'),
    priority: leadPriorityEnum('priority').notNull().default('MEDIUM'),
    category: varchar('category', { length: 120 }),
    dealValue: numeric('deal_value', { precision: 14, scale: 2 }),
    currency: varchar('currency', { length: 10 }).notNull().default('USD'),
    probability: integer('probability'),
    expectedCloseDate: timestamp('expected_close_date'),
    actualCloseDate: timestamp('actual_close_date'),
    lossReason: text('loss_reason'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    // Phase 4: admin-defined extra fields, keyed by custom_field_definitions.key. Purely
    // additive — every existing typed column above remains the source of truth for its own
    // data; this bag only ever holds values for fields an org admin has defined. Full-replace
    // on update (matching the `tags` field's own pattern), not a merge — see leads.service.ts.
    customFields: jsonb('custom_fields').notNull().default(sql`'{}'::jsonb`),

    assignedToId: uuid('assigned_to_id').references(() => users.id),
    currentOwnerId: uuid('current_owner_id').references(() => users.id),
    createdById: uuid('created_by_id').references(() => users.id),
    // SDR (Sales Development Rep) who sourced/qualified the lead — distinct from
    // assignedToId (current working rep) and currentOwnerId (current owner);
    // always drawn from active INSIDE_SALES users, never a free-text name.
    // Labeled "Lead Generated by" on the Lead Creation/Edit forms.
    sdrId: uuid('sdr_id').references(() => users.id),
    // "Created By" dropdown on the Lead Creation/Edit forms — also drawn from active
    // INSIDE_SALES users. Distinct from createdById (the system-audit field set
    // automatically to whichever logged-in user submitted the form, used for
    // edit_own permission checks) — this is a manually-selected attribution field,
    // e.g. for when an Admin or a different rep is entering a lead on an SDR's behalf.
    createdBySdrId: uuid('created_by_sdr_id').references(() => users.id),

    meetingDetails: text('meeting_details'),
    // Renamed from "comments" to "Email Response" per the lead-creation module
    // enhancement — the column itself is renamed (not just relabeled) so API
    // payloads, exports, and search stay consistent with the new UI label.
    emailResponse: text('email_response'),
    mom: text('mom'),
    nextSteps: text('next_steps'),

    // Date the lead was received (defaults to today at creation, editable afterward
    // by anyone with edit rights on the lead — separate from createdAt, which is a
    // pure system audit timestamp and should never be hand-edited).
    leadReceivedDate: timestamp('lead_received_date').notNull().defaultNow(),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('leads_status_idx').on(t.status),
    index('leads_assigned_to_idx').on(t.assignedToId),
    index('leads_current_owner_idx').on(t.currentOwnerId),
    index('leads_sdr_idx').on(t.sdrId),
    index('leads_created_by_sdr_idx').on(t.createdBySdrId),
    index('leads_company_idx').on(t.companyId),
    index('leads_contact_idx').on(t.contactId),
    index('leads_campaign_idx').on(t.campaignId),
    index('leads_source_idx').on(t.source),
    index('leads_created_at_idx').on(t.createdAt),
    index('leads_priority_idx').on(t.priority),
    index('leads_received_date_idx').on(t.leadReceivedDate),
    // Tenant-aware composite indexes (Architecture Report section K / 55) — the shapes every
    // org-scoped list/dashboard query actually filters+sorts by.
    index('leads_org_idx').on(t.organizationId),
    index('leads_org_created_idx').on(t.organizationId, t.createdAt),
    index('leads_org_owner_idx').on(t.organizationId, t.currentOwnerId),
    index('leads_org_status_idx').on(t.organizationId, t.status),
  ]
);

// ----------------------------------------------------------------------------
// Engagement entities
// ----------------------------------------------------------------------------
export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    type: meetingTypeEnum('type').notNull().default('DISCOVERY'),
    status: meetingStatusEnum('status').notNull().default('SCHEDULED'),
    scheduledAt: timestamp('scheduled_at').notNull(),
    // One of the predefined US timezone codes (EST/CST/MST/PST) when the lead's
    // country is USA, or whatever the lead creator typed for a non-US/manual entry.
    timeZone: varchar('time_zone', { length: 50 }),
    durationMins: integer('duration_mins').notNull().default(30),
    location: text('location'),
    attendees: text('attendees').array().notNull().default(sql`'{}'::text[]`),
    mom: text('mom'),
    outcome: text('outcome'),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('meetings_lead_id_idx').on(t.leadId),
    index('meetings_scheduled_at_idx').on(t.scheduledAt),
    index('meetings_status_idx').on(t.status),
    index('meetings_org_idx').on(t.organizationId),
  ]
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    dueDate: timestamp('due_date'),
    status: taskStatusEnum('status').notNull().default('PENDING'),
    priority: taskPriorityEnum('priority').notNull().default('MEDIUM'),
    assignedToId: uuid('assigned_to_id').references(() => users.id),
    createdById: uuid('created_by_id').references(() => users.id),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('tasks_lead_id_idx').on(t.leadId),
    index('tasks_assigned_to_idx').on(t.assignedToId),
    index('tasks_status_idx').on(t.status),
    index('tasks_due_date_idx').on(t.dueDate),
    index('tasks_org_idx').on(t.organizationId),
  ]
);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 150 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storagePath: text('storage_path').notNull(),
    documentType: documentTypeEnum('document_type').notNull().default('OTHER'),
    uploadedById: uuid('uploaded_by_id').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('documents_lead_id_idx').on(t.leadId),
    index('documents_company_id_idx').on(t.companyId),
    index('documents_org_idx').on(t.organizationId),
  ]
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    body: text('body').notNull(),
    editedAt: timestamp('edited_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('comments_lead_id_idx').on(t.leadId), index('comments_org_idx').on(t.organizationId)]
);

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    type: activityTypeEnum('type').notNull(),
    description: text('description').notNull(),
    metadata: jsonb('metadata'),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('activities_lead_created_idx').on(t.leadId, t.createdAt),
    index('activities_company_idx').on(t.companyId),
    index('activities_contact_idx').on(t.contactId),
    index('activities_type_idx').on(t.type),
    index('activities_org_idx').on(t.organizationId),
  ]
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_read_idx').on(t.userId, t.isRead),
    index('notifications_created_at_idx').on(t.createdAt),
    index('notifications_org_idx').on(t.organizationId),
  ]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Nullable, unlike every other tenant-scoped table: a LOGIN_FAILED entry for an email that
    // doesn't belong to any known user has no tenant to attach to yet. Every audit row written
    // from an authenticated context still gets one — see utils/auditLogger.ts.
    organizationId: uuid('organization_id').references(() => organizations.id),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: auditActionEnum('action').notNull(),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: varchar('entity_id', { length: 100 }),
    oldValues: jsonb('old_values'),
    newValues: jsonb('new_values'),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_user_idx').on(t.userId),
    index('audit_logs_created_at_idx').on(t.createdAt),
    index('audit_logs_org_idx').on(t.organizationId),
  ]
);

// ----------------------------------------------------------------------------
// Relations (powers Drizzle's relational query API: db.query.leads.findMany({with:{...}}))
// ----------------------------------------------------------------------------
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  roles: many(roles),
  companies: many(companies),
  contacts: many(contacts),
  leads: many(leads),
  campaigns: many(campaigns),
  customFieldDefinitions: many(customFieldDefinitions),
  pipelineStages: many(pipelineStages),
  customObjectDefinitions: many(customObjectDefinitions),
  customObjectRecords: many(customObjectRecords),
  savedViews: many(savedViews),
  validationRules: many(validationRules),
}));

export const customFieldDefinitionsRelations = relations(customFieldDefinitions, ({ one }) => ({
  organization: one(organizations, { fields: [customFieldDefinitions.organizationId], references: [organizations.id] }),
}));

export const pipelineStagesRelations = relations(pipelineStages, ({ one }) => ({
  organization: one(organizations, { fields: [pipelineStages.organizationId], references: [organizations.id] }),
}));

export const customObjectDefinitionsRelations = relations(customObjectDefinitions, ({ one, many }) => ({
  organization: one(organizations, { fields: [customObjectDefinitions.organizationId], references: [organizations.id] }),
  records: many(customObjectRecords),
}));

export const customObjectRecordsRelations = relations(customObjectRecords, ({ one }) => ({
  organization: one(organizations, { fields: [customObjectRecords.organizationId], references: [organizations.id] }),
  objectDefinition: one(customObjectDefinitions, { fields: [customObjectRecords.objectDefinitionId], references: [customObjectDefinitions.id] }),
  createdBy: one(users, { fields: [customObjectRecords.createdById], references: [users.id] }),
}));

export const savedViewsRelations = relations(savedViews, ({ one }) => ({
  organization: one(organizations, { fields: [savedViews.organizationId], references: [organizations.id] }),
  createdBy: one(users, { fields: [savedViews.createdById], references: [users.id] }),
}));

export const validationRulesRelations = relations(validationRules, ({ one }) => ({
  organization: one(organizations, { fields: [validationRules.organizationId], references: [organizations.id] }),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  organization: one(organizations, { fields: [roles.organizationId], references: [organizations.id] }),
  permissions: many(rolePermissions),
  users: many(users),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  roles: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, { fields: [rolePermissions.permissionId], references: [permissions.id] }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, { fields: [users.organizationId], references: [organizations.id] }),
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  createdBy: one(users, { fields: [users.createdById], references: [users.id], relationName: 'userCreatedBy' }),
  refreshTokens: many(refreshTokens),
  assignedLeads: many(leads, { relationName: 'leadAssignedTo' }),
  ownedLeads: many(leads, { relationName: 'leadOwner' }),
  sdrLeads: many(leads, { relationName: 'leadSdr' }),
  createdBySdrLeads: many(leads, { relationName: 'leadCreatedBySdr' }),
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  organization: one(organizations, { fields: [companies.organizationId], references: [organizations.id] }),
  contacts: many(contacts),
  leads: many(leads),
  documents: many(documents),
  activities: many(activities),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  organization: one(organizations, { fields: [contacts.organizationId], references: [organizations.id] }),
  company: one(companies, { fields: [contacts.companyId], references: [companies.id] }),
  leads: many(leads),
  activities: many(activities),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  organization: one(organizations, { fields: [campaigns.organizationId], references: [organizations.id] }),
  leads: many(leads),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  organization: one(organizations, { fields: [leads.organizationId], references: [organizations.id] }),
  company: one(companies, { fields: [leads.companyId], references: [companies.id] }),
  contact: one(contacts, { fields: [leads.contactId], references: [contacts.id] }),
  campaign: one(campaigns, { fields: [leads.campaignId], references: [campaigns.id] }),
  assignedTo: one(users, { fields: [leads.assignedToId], references: [users.id], relationName: 'leadAssignedTo' }),
  currentOwner: one(users, { fields: [leads.currentOwnerId], references: [users.id], relationName: 'leadOwner' }),
  sdr: one(users, { fields: [leads.sdrId], references: [users.id], relationName: 'leadSdr' }),
  createdBy: one(users, { fields: [leads.createdById], references: [users.id] }),
  createdBySdr: one(users, { fields: [leads.createdBySdrId], references: [users.id], relationName: 'leadCreatedBySdr' }),
  meetings: many(meetings),
  tasks: many(tasks),
  documents: many(documents),
  leadComments: many(comments),
  activities: many(activities),
  notifications: many(notifications),
}));

export const meetingsRelations = relations(meetings, ({ one }) => ({
  lead: one(leads, { fields: [meetings.leadId], references: [leads.id] }),
  createdBy: one(users, { fields: [meetings.createdById], references: [users.id] }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  lead: one(leads, { fields: [tasks.leadId], references: [leads.id] }),
  assignedTo: one(users, { fields: [tasks.assignedToId], references: [users.id] }),
  createdBy: one(users, { fields: [tasks.createdById], references: [users.id] }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  lead: one(leads, { fields: [documents.leadId], references: [leads.id] }),
  company: one(companies, { fields: [documents.companyId], references: [companies.id] }),
  uploadedBy: one(users, { fields: [documents.uploadedById], references: [users.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  lead: one(leads, { fields: [comments.leadId], references: [leads.id] }),
  user: one(users, { fields: [comments.userId], references: [users.id] }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  lead: one(leads, { fields: [activities.leadId], references: [leads.id] }),
  company: one(companies, { fields: [activities.companyId], references: [companies.id] }),
  contact: one(contacts, { fields: [activities.contactId], references: [contacts.id] }),
  user: one(users, { fields: [activities.userId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  lead: one(leads, { fields: [notifications.leadId], references: [leads.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));
