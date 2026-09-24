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
// Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 3 (calendar sync,
// on top of Stage 1's OAuth connections). NOT_CONNECTED covers both "the creator never connected a
// provider" and "connected, but before the calendar scope existed" — both need the same reconnect
// action, so they share one value rather than needing a caller to distinguish them (see
// utils/calendarSync.ts).
export const calendarSyncStatusEnum = pgEnum('calendar_sync_status', ['NOT_CONNECTED', 'SYNCED', 'FAILED']);
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
  // Phase 13 (super admin), slice 2 — user impersonation. Logged as its own pair of actions
  // (never folded into LOGIN/LOGOUT) so a review of a user's audit trail can tell "they logged in
  // themselves" apart from "a platform admin was viewing the app as them" at a glance — see
  // modules/platformAdmin/platformAdmin.service.ts's impersonateUser and
  // modules/auth/auth.service.ts's endImpersonation.
  'IMPERSONATION_START', 'IMPERSONATION_END',
  // Phase 15 (security hardening) — session/device management (SESSION_REVOKED, when a user or
  // an admin-triggered password change revokes a refresh_tokens row — see auth.service.ts's
  // revokeSession/revokeOtherSessions) and account-lockout brute-force protection
  // (ACCOUNT_LOCKED, logged once when failedLoginAttempts crosses the threshold, not on every
  // subsequent failed attempt while already locked — see auth.service.ts's login()).
  'SESSION_REVOKED', 'ACCOUNT_LOCKED',
  // Phase 15 (security hardening) — TOTP-based MFA. Logged once each, on the transition itself
  // (enabling/disabling), never on an ordinary MFA code check during login — see
  // auth.service.ts's enableMfa/disableMfa.
  'MFA_ENABLED', 'MFA_DISABLED',
]);
// Phase 4: custom fields engine. `entityType` on custom_field_definitions is schema-generic
// (varchar, not an enum limited to LEAD) so a future phase can extend to companies/contacts
// without a migration — but MVP scope only validates/renders 'LEAD' (see
// customFields.validation.ts and the frontend CustomFieldsSection component).
export const customFieldTypeEnum = pgEnum('custom_field_type', [
  'TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTI_SELECT',
]);
// Phase 9 ("advanced CRM" slice) — case management. A case is a post-sale support/service record,
// deliberately its own status vocabulary rather than reusing leadStatusEnum (a case is never "won"
// or "qualified") — same "define your own enum per entity even where values overlap" precedent as
// taskPriorityEnum vs leadPriorityEnum (URGENT vs CRITICAL) below. See modules/cases/cases.service.ts.
export const caseStatusEnum = pgEnum('case_status', ['NEW', 'OPEN', 'PENDING', 'ON_HOLD', 'RESOLVED', 'CLOSED']);
export const casePriorityEnum = pgEnum('case_priority', ['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
// Phase 9 ("advanced CRM" slice) — knowledge base. DRAFT articles are only visible to
// KNOWLEDGE_BASE_MANAGE holders (see that permission's comment in utils/permissions.ts);
// PUBLISHED ones are visible to any authenticated org member. See modules/knowledgeBase/
// knowledgeBase.service.ts.
export const knowledgeArticleStatusEnum = pgEnum('knowledge_article_status', ['DRAFT', 'PUBLISHED']);
// Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 1 (OAuth
// connection infrastructure only; the sequences engine itself is a later, separate slice built on
// top of this). A user optionally connects their own Google or Microsoft mailbox so sequence
// emails (and any other transactional send) go out as them rather than the shared SMTP address;
// SMTP (utils/emailer.ts) remains the always-available fallback when no connection exists or a
// provider isn't server-configured. See utils/tokenCrypto.ts, utils/emailSender.ts, and
// modules/integrations/*.
export const oauthProviderEnum = pgEnum('oauth_provider', ['GOOGLE', 'MICROSOFT']);
// Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 2 (the engine
// itself, built on top of Stage 1's OAuth infra above). A sequence is DRAFT while its steps are
// still being authored, ACTIVE once leads can be enrolled into it, and ARCHIVED to retire it
// (archiving also exits every non-terminal enrollment — see sequences.service.ts's archiveSequence
// — rather than leaving them silently stuck with a sequence that will never advance them again).
export const sequenceStatusEnum = pgEnum('sequence_status', ['DRAFT', 'ACTIVE', 'ARCHIVED']);
// ACTIVE = still receiving steps on schedule; PAUSED = manually held (resumable); COMPLETED = ran
// every step; EXITED = manually removed, or auto-removed by archiving its sequence. Deliberately no
// auto-pause-on-reply-detection state in v1 (per the user's own confirmed scope) — pause/exit are
// always an explicit action, never inferred from inbound mail.
export const sequenceEnrollmentStatusEnum = pgEnum('sequence_enrollment_status', ['ACTIVE', 'PAUSED', 'COMPLETED', 'EXITED']);
export const sequenceSendStatusEnum = pgEnum('sequence_send_status', ['SENT', 'FAILED']);

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
    // Phase 13 (super admin) — a platform-operator flag, entirely orthogonal to the tenant RBAC
    // system above (roleId/permissions). A platform admin is still an ordinary user row belonging
    // to some organization (see PLATFORM_ADMIN_EMAILS in config/env.ts for how this gets set —
    // deliberately not self-service), but this one flag unlocks the separate
    // modules/platformAdmin/* routes, which read/act across EVERY organization rather than being
    // scoped to this user's own organizationId like everything else in this app. Never granted via
    // a role or PERMISSIONS key — mixing it into that system would make an org's own Admin able to
    // grant platform-wide access to one of their own users, which must never be possible.
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    lastLoginAt: timestamp('last_login_at'),
    // Phase 15 (security hardening) — account-level brute-force protection, layered on top of
    // authLimiter's existing per-IP rate limit (middleware/rateLimiter.ts): that limiter can't
    // stop a credential-stuffing attempt against ONE account spread across many IPs, since each
    // IP gets its own budget. failedLoginAttempts increments on every wrong password and resets
    // to 0 on a successful login (see auth.service.ts's login()); once it reaches
    // MAX_FAILED_LOGIN_ATTEMPTS, lockedUntil is set and login() rejects — even with the correct
    // password — until that timestamp passes, same "correct-password check still happens first"
    // ordering as the organization-suspended check just below it, so a locked-out attacker
    // learns nothing about whether their guessed password was actually right.
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until'),
    // Phase 15 (security hardening) — TOTP-based MFA (utils/mfa.ts, auth.service.ts's
    // setupMfa/enableMfa/disableMfa/verifyMfaChallenge). mfaSecretEnc is encrypted at rest the
    // same way email_connections' OAuth tokens are (utils/tokenCrypto.ts) — set as soon as
    // setupMfa generates a secret, but mfaEnabled stays false (and login() ignores it) until
    // enableMfa confirms the user actually scanned it and can produce a valid code; re-running
    // setup before that confirmation simply overwrites the still-pending secret. mfaBackupCodes
    // holds argon2 HASHES only (never the plaintext codes, which are shown to the user exactly
    // once by enableMfa and can't be recovered after that) — same one-way-hash discipline as
    // passwordHash, since a backup code only ever needs to be checked for a match, never read
    // back. `usedAt` on an individual code (rather than deleting it once spent) keeps every
    // issued code's fate visible instead of silently shrinking the array.
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    mfaSecretEnc: text('mfa_secret_enc'),
    mfaBackupCodes: jsonb('mfa_backup_codes').$type<{ hash: string; usedAt: string | null }[]>(),
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

    // Phase 14 (AI): generated together in one combined call (see modules/ai/ai.service.ts's
    // generateLeadInsights) — never written individually. Deliberately distinct columns from the
    // pre-existing manual `nextSteps` above: that one is a rep's own free-text note, this is the
    // model's own suggestion, and the two must never silently overwrite each other. All four are
    // nullable and start unset; aiInsightsGeneratedAt doubles as "has this ever been generated"
    // (null = never) and as the staleness timestamp shown next to it in the UI.
    aiSummary: text('ai_summary'),
    aiNextStep: text('ai_next_step'),
    aiScore: integer('ai_score'),
    aiInsightsGeneratedAt: timestamp('ai_insights_generated_at'),

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
// Phase 9 ("advanced CRM" slice) — case management
// ----------------------------------------------------------------------------
// A post-sale support/service record, independent of the sales pipeline (leads.status). Optionally
// linked to a Company and/or Contact (both `set null` on delete, same pattern as leads.companyId/
// contactId — a case should outlive the account record it referenced, not vanish with it) and to an
// assignee. Deliberately NOT linked to a lead: a case can exist for a customer with no open lead at
// all, and tying it to one would force every case to pretend it's pipeline activity.
//
// Kept fully self-contained (its own case_comments table below, rather than reusing the leads-only
// `comments`/`activities`/`notifications` tables) — those three all have a NOT NULL or otherwise
// lead-shaped foreign key wired through every call site that writes to them today, so bolting a
// caseId onto them would mean threading a second, always-optional entity reference through code
// that has never had to consider one. A dedicated table costs one small migration and duplicates a
// well-understood shape (mirrors `comments` almost exactly); it does not risk regressing every
// existing lead-comment/activity/notification code path. Same reasoning that kept Phase 9's
// duplicate-merge feature out of the shared audit/activity plumbing beyond the one new MERGE enum
// value it strictly needed.
export const cases = pgTable(
  'cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    caseNumber: integer('case_number').notNull().unique().generatedAlwaysAsIdentity(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    subject: varchar('subject', { length: 255 }).notNull(),
    description: text('description'),
    status: caseStatusEnum('status').notNull().default('NEW'),
    priority: casePriorityEnum('priority').notNull().default('MEDIUM'),
    assignedToId: uuid('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
    createdById: uuid('created_by_id').references(() => users.id),
    // Set automatically the moment `status` transitions into RESOLVED/CLOSED (mirrors
    // tasks.completedAt's on-transition pattern) — never hand-set by a client payload.
    resolvedAt: timestamp('resolved_at'),
    closedAt: timestamp('closed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('cases_org_idx').on(t.organizationId),
    index('cases_org_status_idx').on(t.organizationId, t.status),
    index('cases_org_created_idx').on(t.organizationId, t.createdAt),
    index('cases_company_idx').on(t.companyId),
    index('cases_contact_idx').on(t.contactId),
    index('cases_assigned_to_idx').on(t.assignedToId),
  ]
);

export const caseComments = pgTable(
  'case_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    body: text('body').notNull(),
    editedAt: timestamp('edited_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('case_comments_case_id_idx').on(t.caseId), index('case_comments_org_idx').on(t.organizationId)]
);

// ----------------------------------------------------------------------------
// Phase 9 ("advanced CRM" slice) — knowledge base
// ----------------------------------------------------------------------------
// Internal reference articles (FAQ/how-to/policy content) for reps, independent of any other
// entity — deliberately NOT linked to Cases/Companies/etc. in this increment (an article is
// general reference material, not tied to one case's lifecycle; linking is a documented, deferred
// enhancement, not a gap). `category` is a curated-but-free-text string, same precedent as
// companies.industry — a fixed dropdown in the UI, never DB-constrained, so an article authored
// before a category existed in the curated list can still be re-saved without being forced into
// one. `tags` mirrors leads.tags exactly (text[], default '{}').
export const knowledgeArticles = pgTable(
  'knowledge_articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    title: varchar('title', { length: 255 }).notNull(),
    category: varchar('category', { length: 150 }),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    content: text('content').notNull(),
    status: knowledgeArticleStatusEnum('status').notNull().default('DRAFT'),
    createdById: uuid('created_by_id').references(() => users.id),
    // Set automatically the moment `status` transitions into PUBLISHED, cleared if reverted to
    // DRAFT — never accepted directly from a request body (mirrors cases.resolvedAt/closedAt).
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('knowledge_articles_org_idx').on(t.organizationId),
    index('knowledge_articles_org_status_idx').on(t.organizationId, t.status),
    index('knowledge_articles_org_category_idx').on(t.organizationId, t.category),
  ]
);

// ----------------------------------------------------------------------------
// Phase 9 ("advanced CRM" slice) — email connections (sequences Stage 1)
// ----------------------------------------------------------------------------
// One row per USER (not per organization) — each rep connects their own mailbox, never a
// shared org-wide inbox, hence the unique index on userId alone rather than (organizationId,
// userId). organizationId is still carried (like refreshTokens carries userId only, but every
// other Phase-9 table carries organizationId) so tenant-scoping helpers and admin/reporting
// queries can filter without a join — same "denormalize the tenant key onto every table" rule
// the rest of the schema already follows.
// accessTokenEnc/refreshTokenEnc are AES-256-GCM ciphertext (iv.authTag.ciphertext, base64
// segments — see utils/tokenCrypto.ts), never plaintext, and are never returned by any API
// response (see modules/integrations/integrations.service.ts's getConnectionStatus, which
// exposes only provider/emailAddress/connectedAt).
export const emailConnections = pgTable(
  'email_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
    provider: oauthProviderEnum('provider').notNull(),
    emailAddress: varchar('email_address', { length: 255 }).notNull(),
    accessTokenEnc: text('access_token_enc').notNull(),
    refreshTokenEnc: text('refresh_token_enc').notNull(),
    tokenExpiresAt: timestamp('token_expires_at').notNull(),
    scope: text('scope'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('email_connections_org_idx').on(t.organizationId)]
);

// ----------------------------------------------------------------------------
// Phase 9 ("advanced CRM" slice) — sequences (Stage 2: the engine, on top of Stage 1's connections)
// ----------------------------------------------------------------------------
// A sequence is an org-wide, reusable template (author it once, enroll many leads) — its own
// `sequenceSteps` rows, not a snapshot copied per enrollment, which is a deliberate v1
// simplification: editing an ACTIVE sequence's steps affects every enrollment still in flight,
// since the engine reads live step rows at send time rather than a frozen copy (see
// sequences.service.ts's module comment for the full reasoning).
export const sequences = pgTable(
  'sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    status: sequenceStatusEnum('status').notNull().default('DRAFT'),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('sequences_org_idx').on(t.organizationId), index('sequences_org_status_idx').on(t.organizationId, t.status)]
);

// `stepOrder` is a plain integer, deliberately not kept contiguous (1,2,3…) after a delete — every
// lookup is relative ("the step after this stepOrder", "the minimum stepOrder in this sequence"),
// so gaps left by a delete never matter and no renumbering pass is needed. `delayDays` is business
// days after the PREVIOUS step was actually sent (or after enrollment, for the first step) — see
// utils/sequenceScheduling.ts.
export const sequenceSteps = pgTable(
  'sequence_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sequenceId: uuid('sequence_id').notNull().references(() => sequences.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    stepOrder: integer('step_order').notNull(),
    delayDays: integer('delay_days').notNull().default(0),
    subject: varchar('subject', { length: 255 }).notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sequence_steps_sequence_order_idx').on(t.sequenceId, t.stepOrder),
    index('sequence_steps_org_idx').on(t.organizationId),
  ]
);

// One row per (sequence, lead) that is CURRENTLY enrolled or has a history worth keeping —
// deliberately NOT a hard-unique (sequenceId, leadId) constraint, so a lead that COMPLETED or
// EXITED a sequence can be re-enrolled into it later (a very plausible real use: re-running a
// cadence on a lead that went cold). Only one ACTIVE/PAUSED row per (sequenceId, leadId) is
// allowed, enforced in sequences.service.ts's enrollLead — an application-level check, not a DB
// constraint, since the DB has no easy way to express "unique among a subset of rows".
// `currentStepId` (not a stepOrder integer) is the step still pending for this enrollment —
// pointing at the actual row survives a later step reorder; `onDelete: 'set null'` on its FK is a
// safety net, but sequences.service.ts's deleteStep refuses to delete a step any ACTIVE/PAUSED
// enrollment currently points at, so in practice this should never fire.
export const sequenceEnrollments = pgTable(
  'sequence_enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    sequenceId: uuid('sequence_id').notNull().references(() => sequences.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    enrolledById: uuid('enrolled_by_id').notNull().references(() => users.id),
    status: sequenceEnrollmentStatusEnum('status').notNull().default('ACTIVE'),
    currentStepId: uuid('current_step_id').references(() => sequenceSteps.id, { onDelete: 'set null' }),
    // Null once PAUSED/COMPLETED/EXITED — the scheduler's due-work query is `status = 'ACTIVE' AND
    // nextSendAt <= now()`, so a null here (regardless of status) is simply never picked up.
    nextSendAt: timestamp('next_send_at'),
    pausedAt: timestamp('paused_at'),
    completedAt: timestamp('completed_at'),
    exitedAt: timestamp('exited_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('sequence_enrollments_org_idx').on(t.organizationId),
    index('sequence_enrollments_sequence_idx').on(t.sequenceId),
    index('sequence_enrollments_lead_idx').on(t.leadId),
    // The scheduler's own due-work query shape — see utils/sequenceScheduling.ts's caller in
    // sequences.service.ts's runDueSequenceSteps.
    index('sequence_enrollments_status_next_send_idx').on(t.status, t.nextSendAt),
  ]
);

// An append-only log of every send attempt (one row per attempt, not per success) — this is what
// a Sequence's detail page reads to show "last sent" history, and what lets a human debug why an
// enrollment stalled (see the FAILED rows' errorMessage) without needing server log access.
export const sequenceSends = pgTable(
  'sequence_sends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    enrollmentId: uuid('enrollment_id').notNull().references(() => sequenceEnrollments.id, { onDelete: 'cascade' }),
    stepId: uuid('step_id').references(() => sequenceSteps.id, { onDelete: 'set null' }),
    status: sequenceSendStatusEnum('status').notNull(),
    errorMessage: text('error_message'),
    sentAt: timestamp('sent_at').notNull().defaultNow(),
  },
  (t) => [index('sequence_sends_enrollment_idx').on(t.enrollmentId)]
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
    // Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 3. Calendar
    // identity always follows `createdById` (the meeting's calendar "owner"), never whoever
    // happens to be editing it — mirrors sequences using `enrolledById`, not the current caller,
    // as the sending identity. externalEventId/externalCalendarProvider are both null whenever
    // calendarSyncStatus is NOT_CONNECTED or FAILED-without-a-prior-success; a FAILED *update* on
    // an already-synced meeting keeps the old externalEventId (the event still exists out there,
    // only our patch failed) — see utils/calendarSync.ts.
    externalCalendarProvider: oauthProviderEnum('external_calendar_provider'),
    externalEventId: varchar('external_event_id', { length: 255 }),
    calendarSyncStatus: calendarSyncStatusEnum('calendar_sync_status').notNull().default('NOT_CONNECTED'),
    calendarSyncError: text('calendar_sync_error'),
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
// Phase 10 — reporting/dashboard builder, slice 1: custom report builder
// ----------------------------------------------------------------------------
// A saved report definition: pick a groupBy dimension + a metric, optionally filter the leads
// considered, and pick a chart type to render the result as. Deliberately LEAD-only for now
// (entityType stays a plain string, not hardcoded, for the same reason customFieldDefinitions/
// savedViews/validationRules keep it a column rather than a literal — a future entity can adopt
// this without a schema change). Ownership/sharing model copied exactly from savedViews (Phase 7):
// personal by default, visible only to its creator; isShared makes it organization-wide, gated on
// REPORTS_MANAGE_SHARED to create/edit/delete (same "management tier" as SAVED_VIEWS_MANAGE_SHARED)
// — see reportBuilder.service.ts.
//
// groupBy/metric/chartType are plain validated strings (not pgEnums) — see
// reportBuilder.validation.ts for the fixed option lists enforced at the API boundary. Kept as
// strings rather than enums so adding a new dimension/metric/chart type later is a validation-file
// change, not a migration, matching this codebase's existing "config-shaped" jsonb/varchar columns
// (customFieldDefinitions.fieldType is the one exception that predates this precedent).
//
// `filters` is a small structured jsonb bag (status/priority/source/campaignId/assignedToId/
// ownerId/dateField/dateFrom/dateTo/includeInactive) rather than an open-ended query builder —
// every field it can filter on is a single value, mirroring how LeadsListPage's own filter bar
// (and thus savedViews.filters) is single-value-per-field, not multi-select. Company-level
// dimensions (country/industry) are only ever a groupBy choice, not also a filter, to avoid needing
// an unconditional join to `companies` on every run — a deliberate, documented scope cut for this
// slice.
export const customReportDefinitions = pgTable(
  'custom_report_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    entityType: varchar('entity_type', { length: 50 }).notNull().default('LEAD'),
    name: varchar('name', { length: 150 }).notNull(),
    description: text('description'),
    groupBy: varchar('group_by', { length: 50 }).notNull(),
    metric: varchar('metric', { length: 50 }).notNull().default('COUNT'),
    chartType: varchar('chart_type', { length: 20 }).notNull().default('BAR'),
    filters: jsonb('filters').notNull().default(sql`'{}'::jsonb`),
    isShared: boolean('is_shared').notNull().default(false),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('custom_report_definitions_org_entity_idx').on(t.organizationId, t.entityType),
    uniqueIndex('custom_report_definitions_org_entity_creator_name_unique').on(
      t.organizationId,
      t.entityType,
      t.createdById,
      t.name
    ),
  ]
);

// ----------------------------------------------------------------------------
// Phase 10 — reporting/dashboard builder, slice 2: dashboard widget pinning
// ----------------------------------------------------------------------------
// The other half of "reporting/dashboard builder" deliberately deferred out of slice 1 (see
// customReportDefinitions' own comment above) — letting a user pin any custom report they can see
// (their own, or a shared one) onto their own personal dashboard layout. Unlike
// customReportDefinitions, a widget has no isShared/ownership model to speak of: it's inherently
// personal, scoped by userId alone, the same way every user already gets their own view of the
// fixed Dashboard page. `organizationId` is still stored (rather than derived through a join every
// time) purely so every query here can use the same tenant-scoping index pattern as every other
// table in this schema — it is never used to decide visibility, only userId is.
//
// `reportDefinitionId` cascades on delete: unpinning a report that's since been deleted should
// never leave an orphaned widget row or a foreign-key error on the report's own delete path (see
// reportBuilder.service.ts's deleteReportDefinition, which is otherwise unaware this table exists).
// `userId` deliberately does NOT cascade — this app deactivates users rather than hard-deleting
// them (see customObjectRecords.createdById's own comment), so a dangling reference here would
// indicate a real data-integrity bug, not an expected case to silently clean up.
export const dashboardWidgets = pgTable(
  'dashboard_widgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    reportDefinitionId: uuid('report_definition_id')
      .notNull()
      .references(() => customReportDefinitions.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('dashboard_widgets_org_user_idx').on(t.organizationId, t.userId),
    // A user can pin the same report onto their dashboard at most once — pinning again is a no-op
    // from their point of view, not a second widget (see dashboardWidgets.service.ts's pinReport).
    uniqueIndex('dashboard_widgets_user_report_unique').on(t.userId, t.reportDefinitionId),
  ]
);

// ----------------------------------------------------------------------------
// Phase 11 — API/integrations, slice 1: versioned public API + API keys
// ----------------------------------------------------------------------------
// A tenant-scoped credential an external caller presents (via the `X-Api-Key` header — see
// middleware/auth.ts) instead of logging in as a user. Deliberately **read-only**: the auth
// middleware rejects any non-GET request authenticated via an API key, regardless of which
// permissions the key holds. This isn't a permission-model gap — it's because dozens of
// `*.service.ts` write paths across this codebase use `req.user.sub` directly as a `createdById`/
// `assignedToId`/etc. foreign key (see e.g. leads.service.ts, comments.service.ts). An API key has
// no real `users` row behind it, so letting one through to a write path would either violate an FK
// constraint or silently attribute a write to a synthetic, non-existent actor — a materially worse
// outcome than simply not supporting API-key writes yet. Read-only access covers the realistic v1
// use case (external reporting/sync) without that risk; write access is a future increment once an
// actor-attribution story for non-human callers is designed on purpose, not as a side effect.
//
// `permissions` stores the exact subset of the fixed PERMISSIONS catalog this key was granted at
// creation time (validated against ALL_PERMISSIONS — see apiKeys.validation.ts), mirroring how a
// role's grants are just a list of permission keys; unlike roles.ts's `rolePermissions` join table,
// this is a plain jsonb array (customReportDefinitions.filters' own precedent) since a key's grants
// are fixed at creation and never diffed/edited in place — revoke and issue a new key instead.
// Nothing here restricts an ADMIN from granting a key every permission that exists: only ADMIN
// holds API_KEYS_MANAGE by default, and ADMIN already holds every permission via ALL_PERMISSIONS,
// so there is no privilege the key-creation step could escalate to that its creator didn't already
// have. `keyHash` is a SHA-256 digest of the full secret (same approach as `refresh_tokens` — see
// utils/tokens.ts's hashToken) so the plaintext key is never stored; `keyPrefix` is only ever the
// first several characters, kept so a revoked/active key can be told apart in a list without ever
// re-displaying the secret, which — like a refresh token — is shown to the creator exactly once.
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    name: varchar('name', { length: 150 }).notNull(),
    keyPrefix: varchar('key_prefix', { length: 24 }).notNull(),
    keyHash: varchar('key_hash', { length: 64 }).notNull().unique(),
    permissions: jsonb('permissions').notNull().default(sql`'[]'::jsonb`),
    createdById: uuid('created_by_id').references(() => users.id),
    lastUsedAt: timestamp('last_used_at'),
    // Soft-revoke, not a delete — keeps the key's usage/audit trail (who created it, when it was
    // last used) intact instead of erasing it the moment access is cut off.
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('api_keys_org_idx').on(t.organizationId)]
);

// Phase 15 (security hardening) — org-level IP allowlisting. Deliberately its own small table
// (same shape as apiKeys/webhookEndpoints just above/below) rather than a single text[] column on
// organizations: each entry needs its own createdAt/createdById for an audit trail of who opened
// up which range and when, and a table gives CRUD (list/add/delete) for free the way a column
// wouldn't. An organization with ZERO rows here is unrestricted — the allowlist only starts
// enforcing once at least one entry exists (see middleware/ipAllowlist.ts), so adding this table
// changes nothing for any existing organization until an Admin deliberately opts in.
export const ipAllowlistEntries = pgTable(
  'ip_allowlist_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    // A single IPv4/IPv6 address (treated as that address alone, i.e. implicitly /32 or /128) or a
    // CIDR range (e.g. "203.0.113.0/24") — see middleware/ipAllowlist.ts's matcher for exactly
    // what's accepted. IPv4-only for v1 (documented there, not here) — a legitimate future
    // improvement, not a blocker for the common case of allowlisting an office/VPN egress IP.
    cidr: varchar('cidr', { length: 64 }).notNull(),
    label: varchar('label', { length: 150 }),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('ip_allowlist_entries_org_idx').on(t.organizationId)]
);

// ----------------------------------------------------------------------------
// Phase 11 — API/integrations, slice 2: outbound webhooks
// ----------------------------------------------------------------------------
// A tenant-registered URL that this app POSTs signed event payloads to (lead created, status
// changed, etc. — see modules/webhooks/webhookEvents.ts for the fixed event-type catalog, kept as
// a plain TS array validated by zod rather than a DB enum, same reasoning as apiKeys.permissions
// just above: the catalog can grow without a migration).
//
// `secret` is intentionally stored and returned in **plaintext** — the opposite choice from
// apiKeys.keyHash just above, and deliberately so: an API key's secret is a bearer credential (it
// grants access *to us*), so it's hashed and shown exactly once. A webhook secret grants no access
// to anything — it only lets the tenant's own receiving endpoint recompute the HMAC in
// `X-Webhook-Signature` and confirm a delivery genuinely came from this app. Knowing it lets you
// verify, not attack, so there's no reason to force a "copy it now or lose it forever" flow; a
// tenant can come back to Settings and re-copy it into their receiver whenever they need to.
//
// `isActive` (not a revokedAt-style soft-delete) is the on/off switch — unlike an API key, a
// webhook endpoint is expected to be paused and resumed routinely (a receiver under maintenance,
// a noisy integration being debugged) without losing its URL/secret/event subscriptions, so this
// gets a real toggle (PATCH /webhooks/:id, isActive only) rather than apiKeys' "revoke and reissue"
// model. url/secret/eventTypes stay immutable after creation, same rationale as apiKeys' fields —
// change the subscription, delete and recreate the endpoint.
export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    url: varchar('url', { length: 2048 }).notNull(),
    secret: varchar('secret', { length: 64 }).notNull(),
    // Array of event-type strings from WEBHOOK_EVENTS (webhookEvents.ts) this endpoint is
    // subscribed to. A jsonb array (not a join table) — same "fixed set, validated at the app
    // layer" shape as apiKeys.permissions, since a webhook subscription list is exactly as
        // static-per-record as a key's permission grant.
    eventTypes: jsonb('event_types').notNull().default(sql`'[]'::jsonb`),
    isActive: boolean('is_active').notNull().default(true),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('webhook_endpoints_org_idx').on(t.organizationId)]
);

export const webhookDeliveryStatusEnum = pgEnum('webhook_delivery_status', ['PENDING', 'SUCCEEDED', 'FAILED']);

// One row per (event, endpoint) delivery attempt-in-progress-or-settled — this is both the retry
// queue (webhookScheduler.ts's tick scans for PENDING rows whose nextAttemptAt is due) AND the
// delivery log a tenant can review in Settings to see whether their receiver is actually getting
// events. Deliberately no new job-queue infrastructure (no BullMQ/SQS) — this table plus a plain
// `setInterval` in webhookScheduler.ts is the exact same in-process pattern already signed off on
// for modules/sequences/sequenceScheduler.ts, reused rather than re-decided.
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    // Cascade: deleting the endpoint (there is no soft-delete for it) takes its delivery history
    // with it — that history only ever meant anything in the context of an endpoint that still
    // exists to receive events.
    webhookEndpointId: uuid('webhook_endpoint_id').notNull().references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    payload: jsonb('payload').notNull(),
    status: webhookDeliveryStatusEnum('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at').notNull().defaultNow(),
    lastAttemptAt: timestamp('last_attempt_at'),
    lastStatusCode: integer('last_status_code'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('webhook_deliveries_org_idx').on(t.organizationId),
    index('webhook_deliveries_endpoint_idx').on(t.webhookEndpointId),
    // Powers the scheduler's own query: `WHERE status = 'PENDING' AND next_attempt_at <= now()`.
    index('webhook_deliveries_due_idx').on(t.status, t.nextAttemptAt),
  ]
);

// ----------------------------------------------------------------------------
// Phase 11 — API/integrations, slice 3: third-party connector abstraction layer
// ----------------------------------------------------------------------------
// Deliberately GROUNDWORK ONLY: this stores a tenant's configured connector instances (which
// provider, a display name, its config values) but makes no outbound call to Slack/HubSpot/Zoom/
// etc. itself — see modules/connectors/connectorProviders.ts's catalog comment. It exists so a
// future slice that wires up one real provider has somewhere to store its config and a UI pattern
// to extend, rather than inventing both at the same time it's also learning that provider's API.
//
// `providerId` is validated against the fixed, in-code CONNECTOR_PROVIDERS catalog (not a DB
// enum), same "growable without a migration" shape as webhookEndpoints.eventTypes/apiKeys.
// permissions. `configEnc` is the entire config object, JSON-serialized and then encrypted with
// utils/tokenCrypto.ts's encryptToken/decryptToken — the exact same AES-256-GCM helper Phase 9
// already built for email_connections' OAuth tokens (see that table's own comment), reused here
// rather than re-decided: a connector's config commonly holds a real secret (an API token, a
// webhook signing key), so the whole blob is encrypted rather than only the fields the catalog
// happens to mark 'secret' — simpler, and safer against a catalog entry that mis-marks a field.
// This means creating or updating a connector instance requires TOKEN_ENCRYPTION_KEY to be
// configured, exactly like Phase 9's googleOAuthEnabled/microsoftOAuthEnabled already require —
// see connectors.service.ts.
export const connectorInstances = pgTable(
  'connector_instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    providerId: varchar('provider_id', { length: 100 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    configEnc: text('config_enc').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('connector_instances_org_idx').on(t.organizationId)]
);

// ----------------------------------------------------------------------------
// Phase 12 — billing/subscriptions
// ----------------------------------------------------------------------------
// One row per organization (unique organizationId — this is a one-to-one, modeled as its own
// table rather than columns bolted onto `organizations` so it can be created lazily: see
// billing.service.ts's getOrCreateSubscription, which inserts a FREE-plan row the first time an
// org's billing is looked at, rather than requiring a backfill migration for every org that
// existed before this phase). `planId` is validated against the fixed, in-code PLANS catalog
// (modules/billing/plans.ts) — not a DB enum — same "growable without a migration" shape as
// apiKeys.permissions/webhookEndpoints.eventTypes/connectorInstances.providerId. `status` mirrors
// Stripe's own subscription status values closely enough to map 1:1 in the webhook handler
// without a translation table. stripeCustomerId/stripeSubscriptionId are null until an org
// actually starts a paid checkout — every org starts on FREE with both null.
export const subscriptionStatusEnum = pgEnum('subscription_status', ['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'INCOMPLETE']);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().unique().references(() => organizations.id),
    planId: varchar('plan_id', { length: 50 }).notNull().default('FREE'),
    status: subscriptionStatusEnum('status').notNull().default('ACTIVE'),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }).unique(),
    currentPeriodEnd: timestamp('current_period_end'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  }
);

// A local mirror of Stripe's own invoice objects, populated exclusively by the `invoice.paid` /
// `invoice.payment_failed` webhook events (see billing.service.ts) — never written from a
// user-facing request. This exists so the billing page can list invoice history without making a
// live Stripe API call on every page load; `hostedInvoiceUrl` is where "download PDF" / "view
// invoice" actually links to (Stripe hosts it, this app never stores the PDF itself).
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    stripeInvoiceId: varchar('stripe_invoice_id', { length: 255 }).notNull().unique(),
    amountDueCents: integer('amount_due_cents').notNull(),
    amountPaidCents: integer('amount_paid_cents').notNull(),
    currency: varchar('currency', { length: 10 }).notNull(),
    // Stripe's own invoice status strings (draft/open/paid/uncollectible/void) — stored verbatim
    // rather than re-mapped into a local enum, since this table exists only to mirror Stripe's
    // data for display, not to be queried/branched on by business logic in this app.
    status: varchar('status', { length: 30 }).notNull(),
    hostedInvoiceUrl: text('hosted_invoice_url'),
    periodStart: timestamp('period_start'),
    periodEnd: timestamp('period_end'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('invoices_org_idx').on(t.organizationId)]
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
  customReportDefinitions: many(customReportDefinitions),
  dashboardWidgets: many(dashboardWidgets),
  apiKeys: many(apiKeys),
  webhookEndpoints: many(webhookEndpoints),
  connectorInstances: many(connectorInstances),
  subscriptions: many(subscriptions),
  invoices: many(invoices),
  ipAllowlistEntries: many(ipAllowlistEntries),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  organization: one(organizations, { fields: [apiKeys.organizationId], references: [organizations.id] }),
  createdBy: one(users, { fields: [apiKeys.createdById], references: [users.id] }),
}));

export const ipAllowlistEntriesRelations = relations(ipAllowlistEntries, ({ one }) => ({
  organization: one(organizations, { fields: [ipAllowlistEntries.organizationId], references: [organizations.id] }),
  createdBy: one(users, { fields: [ipAllowlistEntries.createdById], references: [users.id] }),
}));

export const webhookEndpointsRelations = relations(webhookEndpoints, ({ one, many }) => ({
  organization: one(organizations, { fields: [webhookEndpoints.organizationId], references: [organizations.id] }),
  createdBy: one(users, { fields: [webhookEndpoints.createdById], references: [users.id] }),
  deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  organization: one(organizations, { fields: [webhookDeliveries.organizationId], references: [organizations.id] }),
  webhookEndpoint: one(webhookEndpoints, { fields: [webhookDeliveries.webhookEndpointId], references: [webhookEndpoints.id] }),
}));

export const connectorInstancesRelations = relations(connectorInstances, ({ one }) => ({
  organization: one(organizations, { fields: [connectorInstances.organizationId], references: [organizations.id] }),
  createdBy: one(users, { fields: [connectorInstances.createdById], references: [users.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  organization: one(organizations, { fields: [subscriptions.organizationId], references: [organizations.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  organization: one(organizations, { fields: [invoices.organizationId], references: [organizations.id] }),
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

export const customReportDefinitionsRelations = relations(customReportDefinitions, ({ one, many }) => ({
  organization: one(organizations, { fields: [customReportDefinitions.organizationId], references: [organizations.id] }),
  createdBy: one(users, { fields: [customReportDefinitions.createdById], references: [users.id] }),
  widgets: many(dashboardWidgets),
}));

export const dashboardWidgetsRelations = relations(dashboardWidgets, ({ one }) => ({
  organization: one(organizations, { fields: [dashboardWidgets.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [dashboardWidgets.userId], references: [users.id] }),
  reportDefinition: one(customReportDefinitions, { fields: [dashboardWidgets.reportDefinitionId], references: [customReportDefinitions.id] }),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
  organization: one(organizations, { fields: [cases.organizationId], references: [organizations.id] }),
  company: one(companies, { fields: [cases.companyId], references: [companies.id] }),
  contact: one(contacts, { fields: [cases.contactId], references: [contacts.id] }),
  assignedTo: one(users, { fields: [cases.assignedToId], references: [users.id], relationName: 'caseAssignedTo' }),
  createdBy: one(users, { fields: [cases.createdById], references: [users.id] }),
  comments: many(caseComments),
}));

export const caseCommentsRelations = relations(caseComments, ({ one }) => ({
  case: one(cases, { fields: [caseComments.caseId], references: [cases.id] }),
  user: one(users, { fields: [caseComments.userId], references: [users.id] }),
}));

export const knowledgeArticlesRelations = relations(knowledgeArticles, ({ one }) => ({
  organization: one(organizations, { fields: [knowledgeArticles.organizationId], references: [organizations.id] }),
  createdBy: one(users, { fields: [knowledgeArticles.createdById], references: [users.id] }),
}));

export const emailConnectionsRelations = relations(emailConnections, ({ one }) => ({
  organization: one(organizations, { fields: [emailConnections.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [emailConnections.userId], references: [users.id] }),
}));

export const sequencesRelations = relations(sequences, ({ one, many }) => ({
  organization: one(organizations, { fields: [sequences.organizationId], references: [organizations.id] }),
  createdBy: one(users, { fields: [sequences.createdById], references: [users.id] }),
  steps: many(sequenceSteps),
  enrollments: many(sequenceEnrollments),
}));

export const sequenceStepsRelations = relations(sequenceSteps, ({ one }) => ({
  sequence: one(sequences, { fields: [sequenceSteps.sequenceId], references: [sequences.id] }),
}));

export const sequenceEnrollmentsRelations = relations(sequenceEnrollments, ({ one, many }) => ({
  organization: one(organizations, { fields: [sequenceEnrollments.organizationId], references: [organizations.id] }),
  sequence: one(sequences, { fields: [sequenceEnrollments.sequenceId], references: [sequences.id] }),
  lead: one(leads, { fields: [sequenceEnrollments.leadId], references: [leads.id] }),
  enrolledBy: one(users, { fields: [sequenceEnrollments.enrolledById], references: [users.id] }),
  currentStep: one(sequenceSteps, { fields: [sequenceEnrollments.currentStepId], references: [sequenceSteps.id] }),
  sends: many(sequenceSends),
}));

export const sequenceSendsRelations = relations(sequenceSends, ({ one }) => ({
  enrollment: one(sequenceEnrollments, { fields: [sequenceSends.enrollmentId], references: [sequenceEnrollments.id] }),
  step: one(sequenceSteps, { fields: [sequenceSends.stepId], references: [sequenceSteps.id] }),
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
  // Phase 9: case management.
  assignedCases: many(cases, { relationName: 'caseAssignedTo' }),
  // Phase 9: sequences/email-calendar integration, Stage 1 — one optional connected mailbox
  // per user (unique on emailConnections.userId, hence `one` here despite no explicit relationName
  // pairing needed — there is only one relation between these two tables).
  emailConnection: one(emailConnections, { fields: [users.id], references: [emailConnections.userId] }),
  // Phase 9: sequences, Stage 2 — no relationName needed for either: sequences and
  // sequenceEnrollments each carry only ONE foreign key to users (createdById, enrolledById
  // respectively), so there's no ambiguity for Drizzle to resolve.
  createdSequences: many(sequences),
  sequenceEnrollments: many(sequenceEnrollments),
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  organization: one(organizations, { fields: [companies.organizationId], references: [organizations.id] }),
  contacts: many(contacts),
  leads: many(leads),
  documents: many(documents),
  activities: many(activities),
  cases: many(cases),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  organization: one(organizations, { fields: [contacts.organizationId], references: [organizations.id] }),
  company: one(companies, { fields: [contacts.companyId], references: [companies.id] }),
  leads: many(leads),
  activities: many(activities),
  cases: many(cases),
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
  // Phase 9: sequences, Stage 2.
  sequenceEnrollments: many(sequenceEnrollments),
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
