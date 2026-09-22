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
import { and, eq, count } from 'drizzle-orm';
import { db, pool } from '@/config/db';
import { organizations, roles, permissions, users, companies, contacts, campaigns, leads, meetings, activities } from '@/db/schema';
import { ALL_PERMISSIONS, PERMISSION_DESCRIPTIONS } from '@/utils/permissions';
import { seedDefaultRolesForOrganization } from '@/utils/defaultRoles';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { parseFlexibleDate, splitName, classifyOutcome } from '@/utils/spreadsheetImport';

/**
 * Every fresh seed needs a tenant to attach its data to. This mirrors exactly what the Phase 1
 * multi-tenancy migration (db/migrations/0007_backfill_default_organization.sql) did for the
 * already-running production database, so a brand-new dev/test database ends up in the same
 * shape: one "default" organization owning everything the seed creates.
 */
async function ensureDefaultOrganization() {
  const existing = await db.query.organizations.findFirst({ where: eq(organizations.slug, 'default') });
  if (existing) return existing;
  const [created] = await db.insert(organizations).values({ name: 'SDR ReachOut', slug: 'default' }).returning();
  return created;
}

/**
 * Seeds the global permission catalog (unchanged by Phase 3 — `permissions` stays fixed, platform-
 * wide data tied to actual code-enforced gates), then this organization's own copies of the 5
 * default roles via the same seedDefaultRolesForOrganization() helper organizations.service.ts's
 * signup() uses for every new tenant, so a freshly-seeded dev/test database and a brand-new
 * self-service org end up with roles built the exact same way.
 */
async function seedRolesAndPermissions(organizationId: string) {
  logger.info('Seeding permissions & roles...');

  await Promise.all(
    ALL_PERMISSIONS.map(async (key) => {
      const existing = await db.query.permissions.findFirst({ where: eq(permissions.key, key) });
      if (existing) return existing;
      return db.insert(permissions).values({ key, description: PERMISSION_DESCRIPTIONS[key] }).returning();
    })
  );

  await seedDefaultRolesForOrganization(organizationId);

  logger.info('Roles & permissions seeded.');
}

async function ensureUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  roleName: string;
  password: string;
  organizationId: string;
}) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (existing) return existing;

  // Phase 3: roles are tenant-scoped, so this lookup must be scoped to the same organization the
  // user is being created in — a bare eq(roles.name, ...) would return an arbitrary organization's
  // role of that name now that names are unique per-org rather than platform-wide.
  const role = await db.query.roles.findFirst({ where: and(eq(roles.organizationId, input.organizationId), eq(roles.name, input.roleName)) });
  if (!role) throw new Error(`Role ${input.roleName} not seeded yet for this organization`);

  const passwordHash = await argon2.hash(input.password);
  const [user] = await db
    .insert(users)
    .values({
      organizationId: input.organizationId,
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

async function seedLeadsFromSpreadsheet(organizationId: string, adminId: string, repIdByName: Map<string, string>) {
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
    emailResponse: colIndex('Comments'),
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
    let company = await db.query.companies.findFirst({
      where: and(eq(companies.organizationId, organizationId), eq(companies.name, companyNameStr)),
    });
    if (!company) {
      const [createdCompany] = await db
        .insert(companies)
        .values({
          organizationId,
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
    let contact = email
      ? await db.query.contacts.findFirst({ where: and(eq(contacts.organizationId, organizationId), eq(contacts.email, email)) })
      : undefined;
    if (!contact) {
      const [createdContact] = await db
        .insert(contacts)
        .values({
          organizationId,
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
        let campaign = await db.query.campaigns.findFirst({
          where: and(eq(campaigns.organizationId, organizationId), eq(campaigns.code, campaignCode)),
        });
        if (!campaign) {
          const [createdCampaign] = await db
            .insert(campaigns)
            .values({ organizationId, name: campaignCode, code: campaignCode, createdById: adminId })
            .returning();
          campaign = createdCampaign;
        }
        campaignByCode.set(campaignCode, campaign.id);
      }
      campaignId = campaignByCode.get(campaignCode);
    }

    const sourceRaw = String(get(idx.source) ?? '').toLowerCase();
    const source = sourceRaw.includes('linkedin') ? 'LINKEDIN' : sourceRaw.includes('email') ? 'EMAIL' : 'OTHER';

    const comment = get(idx.emailResponse) ? String(get(idx.emailResponse)) : '';
    const { leadStatus, meetingStatus, meetingType } = classifyOutcome(comment);
    const meetingDate = parseFlexibleDate(get(idx.meetingDate));

    const [lead] = await db
      .insert(leads)
      .values({
        organizationId,
        companyId: company.id,
        contactId: contact.id,
        campaignId,
        source: source as any,
        status: leadStatus as any,
        category: get(idx.category) ? String(get(idx.category)) : null,
        emailResponse: comment || null,
        assignedToId: repId,
        currentOwnerId: repId,
        createdById: repId,
      })
      .returning();

    if (meetingDate) {
      await db.insert(meetings).values({
        organizationId,
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
      organizationId,
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
  const organization = await ensureDefaultOrganization();
  await seedRolesAndPermissions(organization.id);

  const admin = await ensureUser({
    email: env.SEED_ADMIN_EMAIL,
    firstName: 'Innocito',
    lastName: 'Admin',
    roleName: 'ADMIN',
    password: env.SEED_ADMIN_PASSWORD,
    organizationId: organization.id,
  });
  logger.info(`Admin ready: ${admin.email}`);

  // Demo Sales / Delivery / Management users for a realistic role-based demo.
  const demoDefaults = [
    { email: 'sales.lead@innocito.com', firstName: 'Sales', lastName: 'Lead', roleName: 'SALES' },
    { email: 'delivery.lead@innocito.com', firstName: 'Delivery', lastName: 'Lead', roleName: 'DELIVERY' },
    { email: 'management@innocito.com', firstName: 'Management', lastName: 'User', roleName: 'MANAGEMENT' },
  ];
  for (const u of demoDefaults) {
    await ensureUser({ ...u, password: 'Welcome@123', organizationId: organization.id });
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
      organizationId: organization.id,
    });
    repIdByName.set(repName, user.id);
  }

  await seedLeadsFromSpreadsheet(organization.id, admin.id, repIdByName);

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
