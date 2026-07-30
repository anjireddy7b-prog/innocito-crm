/**
 * Database seed script.
 *
 * 1. Seeds the permission catalogue and the 5 roles with their permission grants.
 * 2. Creates a bootstrap Admin account plus one demo user per Inside Sales rep
 *    found in the legacy "Leads and Next Steps" spreadsheet (Admins are the
 *    only ones who create accounts in this CRM — see users.service.ts — so
 *    the seed stands in for that first Admin action).
 * 3. Imports every row of the legacy spreadsheet into Companies / Contacts /
 *    Leads / Meetings / Activities, so the CRM launches with real history
 *    instead of an empty database.
 *
 * Idempotent: safe to re-run against an already-seeded database (uses
 * upsert-by-natural-key patterns and skips the spreadsheet import if leads
 * already exist).
 */
import path from 'path';
import argon2 from 'argon2';
import ExcelJS from 'exceljs';
import { eq, count } from 'drizzle-orm';
import { db, pool } from '@/config/db';
import { roles, permissions, rolePermissions, users, companies, contacts, campaigns, leads, meetings, activities } from '@/db/schema';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, PERMISSIONS } from '@/utils/permissions';
import { env } from '@/config/env';
import { logger } from '@/config/logger';

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  [PERMISSIONS.USERS_MANAGE]: 'Create users, assign roles, reset passwords, enable/disable accounts',
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
  [PERMISSIONS.ROLES_VIEW]: 'View roles & permissions',
};

async function seedRolesAndPermissions() {
  logger.info('Seeding permissions & roles...');

  const permissionRows = await Promise.all(
    ALL_PERMISSIONS.map(async (key) => {
      const existing = await db.query.permissions.findFirst({ where: eq(permissions.key, key) });
      if (existing) return existing;
      const [created] = await db.insert(permissions).values({ key, description: PERMISSION_DESCRIPTIONS[key] }).returning();
      return created;
    })
  );
  const permissionByKey = new Map(permissionRows.map((p) => [p.key, p]));

  const roleDescriptions: Record<string, string> = {
    ADMIN: 'Full system access — manages users, roles, and all data',
    INSIDE_SALES: 'Creates and qualifies leads, schedules first meetings, assigns to Sales/Delivery',
    SALES: 'Owns the sales cycle: meetings, proposals, negotiation, close',
    DELIVERY: 'Owns technical delivery: demos, technical validation, handoff',
    MANAGEMENT: 'Cross-team visibility, reporting, and analytics',
  };

  for (const roleName of Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]) {
    let role = await db.query.roles.findFirst({ where: eq(roles.name, roleName as any) });
    if (!role) {
      const [created] = await db.insert(roles).values({ name: roleName as any, description: roleDescriptions[roleName] }).returning();
      role = created;
    }

    const existingGrants = await db.query.rolePermissions.findMany({ where: eq(rolePermissions.roleId, role.id) });
    const existingPermissionIds = new Set(existingGrants.map((g) => g.permissionId));

    const toGrant = ROLE_PERMISSIONS[roleName]
      .map((key) => permissionByKey.get(key))
      .filter((p): p is NonNullable<typeof p> => !!p && !existingPermissionIds.has(p.id));

    if (toGrant.length) {
      await db.insert(rolePermissions).values(toGrant.map((p) => ({ roleId: role!.id, permissionId: p.id })));
    }
  }

  logger.info('Roles & permissions seeded.');
}

async function ensureUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  roleName: string;
  password: string;
}) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (existing) return existing;

  const role = await db.query.roles.findFirst({ where: eq(roles.name, input.roleName as any) });
  if (!role) throw new Error(`Role ${input.roleName} not seeded yet`);

  const passwordHash = await argon2.hash(input.password);
  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      roleId: role.id,
      passwordHash,
      mustChangePassword: true,
      isActive: true,
    })
    .returning();
  return user;
}

function slugifyEmail(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[().]/g, '')
      .trim()
      .split(/\s+/)
      .join('.')
      .replace(/[^a-z.]/g, '') + '@innocito.com'
  );
}

// ---------------------------------------------------------------------------
// Spreadsheet import
// ---------------------------------------------------------------------------

function parseFlexibleDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    // Excel serial date
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + value * 86400000);
  }
  if (typeof value === 'string') {
    const cleaned = value
      .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const parsed = new Date(cleaned);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const direct = new Date(value);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }
  return null;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '(Unknown)' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function classifyOutcome(comment: string): { leadStatus: string; meetingStatus: string; meetingType: string } {
  const c = comment.toLowerCase();
  if (c.includes('no show')) return { leadStatus: 'CONTACTED', meetingStatus: 'NO_SHOW', meetingType: 'DISCOVERY' };
  if (c.includes('demo')) return { leadStatus: 'DEMO_DONE', meetingStatus: 'COMPLETED', meetingType: 'DEMO' };
  if (c.includes('not responding')) return { leadStatus: 'ON_HOLD', meetingStatus: 'COMPLETED', meetingType: 'DISCOVERY' };
  if (c.includes('looking for job') || c.includes('network') || c.includes('partner')) {
    return { leadStatus: 'DISQUALIFIED', meetingStatus: 'COMPLETED', meetingType: 'DISCOVERY' };
  }
  if (!comment) return { leadStatus: 'MEETING_SCHEDULED', meetingStatus: 'SCHEDULED', meetingType: 'DISCOVERY' };
  return { leadStatus: 'MEETING_DONE', meetingStatus: 'COMPLETED', meetingType: 'DISCOVERY' };
}

async function seedLeadsFromSpreadsheet(adminId: string, repIdByName: Map<string, string>) {
  const [{ value: existingLeadCount }] = await db.select({ value: count() }).from(leads);
  if (Number(existingLeadCount) > 0) {
    logger.info('Leads already present — skipping spreadsheet import.');
    return;
  }

  const filePath = path.resolve(__dirname, '../../seed-data/leads_and_next_steps.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];

  const headerRow = sheet.getRow(1).values as unknown[];
  const headers = headerRow.map((h) => (typeof h === 'string' ? h.trim() : h));
  const colIndex = (name: string) => headers.findIndex((h) => h === name);

  const idx = {
    istRep: colIndex('IST Rep'),
    name: colIndex('Name'),
    designation: colIndex('Designation'),
    email: colIndex('Email ID'),
    company: colIndex('Company'),
    city: colIndex('City'),
    state: colIndex('State'),
    country: colIndex('Country'),
    source: colIndex('Email/Cold Calling'),
    campaign: colIndex('Campaign'),
    meetingDate: colIndex('Meeting Date'),
    comments: colIndex('Comments'),
    category: colIndex('Category'),
  };

  const campaignByCode = new Map<string, string>();
  let created = 0;

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const get = (i: number) => (i > 0 ? row.getCell(i).value : undefined);

    const name = get(idx.name);
    const companyName = get(idx.company);
    if (!name || !companyName) continue;

    const { firstName, lastName } = splitName(String(name));
    const repName = String(get(idx.istRep) ?? '').trim();
    const repId = repIdByName.get(repName) ?? adminId;

    // Company (dedupe by name, case-insensitive)
    const companyNameStr = String(companyName).split(',')[0].trim(); // strip "City, State, USA" appended to a few rows
    let company = await db.query.companies.findFirst({ where: eq(companies.name, companyNameStr) });
    if (!company) {
      const [createdCompany] = await db
        .insert(companies)
        .values({
          name: companyNameStr,
          city: get(idx.city) ? String(get(idx.city)) : null,
          state: get(idx.state) ? String(get(idx.state)) : null,
          country: get(idx.country) ? String(get(idx.country)) : null,
          createdById: repId,
        })
        .returning();
      company = createdCompany;
    }

    // Contact
    const emailRaw = get(idx.email);
    const email = emailRaw ? String(emailRaw).trim().toLowerCase() : null;
    let contact = email ? await db.query.contacts.findFirst({ where: eq(contacts.email, email) }) : undefined;
    if (!contact) {
      const [createdContact] = await db
        .insert(contacts)
        .values({
          companyId: company.id,
          firstName,
          lastName,
          designation: get(idx.designation) ? String(get(idx.designation)) : null,
          email,
          city: get(idx.city) ? String(get(idx.city)) : null,
          state: get(idx.state) ? String(get(idx.state)) : null,
          country: get(idx.country) ? String(get(idx.country)) : null,
          isPrimary: true,
          createdById: repId,
        })
        .returning();
      contact = createdContact;
    }

    // Campaign
    const campaignCode = String(get(idx.campaign) ?? '').trim();
    let campaignId: string | undefined;
    if (campaignCode) {
      if (!campaignByCode.has(campaignCode)) {
        let campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.code, campaignCode) });
        if (!campaign) {
          const [createdCampaign] = await db
            .insert(campaigns)
            .values({ name: campaignCode, code: campaignCode, createdById: adminId })
            .returning();
          campaign = createdCampaign;
        }
        campaignByCode.set(campaignCode, campaign.id);
      }
      campaignId = campaignByCode.get(campaignCode);
    }

    const sourceRaw = String(get(idx.source) ?? '').toLowerCase();
    const source = sourceRaw.includes('linkedin') ? 'LINKEDIN' : sourceRaw.includes('email') ? 'EMAIL' : 'OTHER';

    const comment = get(idx.comments) ? String(get(idx.comments)) : '';
    const { leadStatus, meetingStatus, meetingType } = classifyOutcome(comment);
    const meetingDate = parseFlexibleDate(get(idx.meetingDate));

    const [lead] = await db
      .insert(leads)
      .values({
        companyId: company.id,
        contactId: contact.id,
        campaignId,
        source: source as any,
        status: leadStatus as any,
        category: get(idx.category) ? String(get(idx.category)) : null,
        comments: comment || null,
        assignedToId: repId,
        currentOwnerId: repId,
        createdById: repId,
      })
      .returning();

    if (meetingDate) {
      await db.insert(meetings).values({
        leadId: lead.id,
        title: `Discovery call with ${firstName} ${lastName}`,
        type: meetingType as any,
        status: meetingStatus as any,
        scheduledAt: meetingDate,
        mom: comment || null,
        createdById: repId,
      });
    }

    await db.insert(activities).values({
      type: 'LEAD_CREATED',
      description: `Lead imported from legacy spreadsheet for ${companyNameStr}`,
      leadId: lead.id,
      userId: repId,
      createdAt: meetingDate ?? new Date(),
    });

    created += 1;
  }

  logger.info(`Imported ${created} leads from the legacy spreadsheet.`);
}

async function main() {
  await seedRolesAndPermissions();

  const admin = await ensureUser({
    email: env.SEED_ADMIN_EMAIL,
    firstName: 'Innocito',
    lastName: 'Admin',
    roleName: 'ADMIN',
    password: env.SEED_ADMIN_PASSWORD,
  });
  logger.info(`Admin ready: ${admin.email}`);

  // Demo Sales / Delivery / Management users for a realistic role-based demo.
  const demoDefaults = [
    { email: 'sales.lead@innocito.com', firstName: 'Sales', lastName: 'Lead', roleName: 'SALES' },
    { email: 'delivery.lead@innocito.com', firstName: 'Delivery', lastName: 'Lead', roleName: 'DELIVERY' },
    { email: 'management@innocito.com', firstName: 'Management', lastName: 'User', roleName: 'MANAGEMENT' },
  ];
  for (const u of demoDefaults) {
    await ensureUser({ ...u, password: 'Welcome@123' });
  }

  // Inside Sales reps found in the legacy spreadsheet
  const repNames = ['Venu Budarapu', 'Umesh Nagari', 'Harinath Edagottu', 'Shanmukha Bandaru', 'William John', 'Naga Sri Pravallika Moola'];
  const repIdByName = new Map<string, string>();
  for (const repName of repNames) {
    const { firstName, lastName } = splitName(repName);
    const user = await ensureUser({
      email: slugifyEmail(repName),
      firstName,
      lastName,
      roleName: 'INSIDE_SALES',
      password: 'Welcome@123',
    });
    repIdByName.set(repName, user.id);
  }

  await seedLeadsFromSpreadsheet(admin.id, repIdByName);

  logger.info('✅ Seed complete.');
  logger.info(`Admin login: ${env.SEED_ADMIN_EMAIL} / ${env.SEED_ADMIN_PASSWORD}`);
  logger.info('All demo/rep accounts use password: Welcome@123 (must change on first login)');
}

main()
  .catch((err) => {
    logger.error({ err }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
