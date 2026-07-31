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
export const roleNameEnum = pgEnum('role_name', ['ADMIN', 'INSIDE_SALES', 'SALES', 'DELIVERY', 'MANAGEMENT']);
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
]);

// ----------------------------------------------------------------------------
// Identity / Access
// ----------------------------------------------------------------------------
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: roleNameEnum('name').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

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
  (t) => [index('users_role_id_idx').on(t.roleId), index('users_is_active_idx').on(t.isActive)]
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
  ]
);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
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
  ]
);

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    code: varchar('code', { length: 20 }).unique(),
    description: text('description'),
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
    startDate: timestamp('start_date'),
    endDate: timestamp('end_date'),
    budget: numeric('budget', { precision: 12, scale: 2 }),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('campaigns_status_idx').on(t.status)]
);

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
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
  ]
);

// ----------------------------------------------------------------------------
// Engagement entities
// ----------------------------------------------------------------------------
export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
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
  ]
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
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
  ]
);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
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
  (t) => [index('documents_lead_id_idx').on(t.leadId), index('documents_company_id_idx').on(t.companyId)]
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    body: text('body').notNull(),
    editedAt: timestamp('edited_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('comments_lead_id_idx').on(t.leadId)]
);

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
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
  ]
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('notifications_user_read_idx').on(t.userId, t.isRead), index('notifications_created_at_idx').on(t.createdAt)]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
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
  ]
);

// ----------------------------------------------------------------------------
// Relations (powers Drizzle's relational query API: db.query.leads.findMany({with:{...}}))
// ----------------------------------------------------------------------------
export const rolesRelations = relations(roles, ({ many }) => ({
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
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  createdBy: one(users, { fields: [users.createdById], references: [users.id], relationName: 'userCreatedBy' }),
  refreshTokens: many(refreshTokens),
  assignedLeads: many(leads, { relationName: 'leadAssignedTo' }),
  ownedLeads: many(leads, { relationName: 'leadOwner' }),
  sdrLeads: many(leads, { relationName: 'leadSdr' }),
  createdBySdrLeads: many(leads, { relationName: 'leadCreatedBySdr' }),
}));

export const companiesRelations = relations(companies, ({ many }) => ({
  contacts: many(contacts),
  leads: many(leads),
  documents: many(documents),
  activities: many(activities),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  company: one(companies, { fields: [contacts.companyId], references: [companies.id] }),
  leads: many(leads),
  activities: many(activities),
}));

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  leads: many(leads),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
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
