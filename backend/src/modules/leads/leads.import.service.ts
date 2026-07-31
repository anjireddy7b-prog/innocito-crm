import { Request } from 'express';
import { and, eq, ilike } from 'drizzle-orm';
import { db } from '@/config/db';
import { users, companies, contacts, campaigns, leads, meetings, activities } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { cache } from '@/config/redis';
import { readSpreadsheetRows, findColumn, parseFlexibleDate, splitName, classifyOutcome } from '@/utils/spreadsheetImport';
import { normalizeWebsite } from '@/utils/leadFormOptions';

const LEAD_STATUSES = new Set([
  'NEW', 'CONTACTED', 'QUALIFIED', 'MEETING_SCHEDULED', 'MEETING_DONE', 'DEMO_SCHEDULED',
  'DEMO_DONE', 'PROPOSAL_SENT', 'NEGOTIATION', 'ON_HOLD', 'WON', 'LOST', 'DISQUALIFIED',
]);

export interface LeadImportResult {
  totalDataRows: number;
  created: number;
  skippedDuplicates: number;
  skippedInvalidRows: number;
  errors: { row: number; message: string }[];
}

function cell(row: (string | number | boolean | Date | null)[], idx: number): string {
  if (idx < 0) return '';
  const v = row[idx];
  if (v == null) return '';
  return String(v).trim();
}

export async function importLeadsFromFile(req: Request, file: Express.Multer.File): Promise<LeadImportResult> {
  const { headers, rows } = await readSpreadsheetRows(file.buffer, file.originalname, file.mimetype);

  const idx = {
    istRep: findColumn(headers, ['IST Rep', 'Rep', 'Sales Rep', 'Assigned Rep']),
    sdr: findColumn(headers, ['SDR', 'SDR Name']),
    name: findColumn(headers, ['Name', 'Contact Name', 'Full Name']),
    designation: findColumn(headers, ['Designation', 'Title', 'Job Title']),
    email: findColumn(headers, ['Email ID', 'Email', 'Email Address']),
    phone: findColumn(headers, ['Phone', 'Phone Number', 'Mobile']),
    company: findColumn(headers, ['Company', 'Company Name']),
    city: findColumn(headers, ['City']),
    state: findColumn(headers, ['State']),
    country: findColumn(headers, ['Country']),
    industry: findColumn(headers, ['Industry']),
    website: findColumn(headers, ['Website', 'Website URL']),
    revenue: findColumn(headers, ['Revenue', 'Annual Revenue']),
    source: findColumn(headers, ['Email/Cold Calling', 'Source']),
    status: findColumn(headers, ['Status']),
    campaign: findColumn(headers, ['Campaign']),
    meetingDate: findColumn(headers, ['Meeting Date', 'Date']),
    leadReceivedDate: findColumn(headers, ['Lead Received Date', 'Received Date']),
    emailResponse: findColumn(headers, ['Email Response', 'Comments', 'Comment', 'Notes']),
    category: findColumn(headers, ['Category']),
  };

  if (idx.name === -1 || idx.company === -1) {
    throw ApiError.badRequest(
      `Couldn't find required columns in the file. Expected a "Name" column and a "Company" column — found: ${headers.filter(Boolean).join(', ') || '(no headers detected)'}`
    );
  }

  // Resolve "IST Rep" cell values to existing user accounts by full-name match.
  const allUsers = await db.query.users.findMany({ columns: { id: true, firstName: true, lastName: true } });
  const userIdByName = new Map(allUsers.map((u) => [`${u.firstName} ${u.lastName}`.trim().toLowerCase(), u.id]));

  const campaignByCode = new Map<string, string>();
  const result: LeadImportResult = { totalDataRows: rows.length, created: 0, skippedDuplicates: 0, skippedInvalidRows: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2; // account for the header row when reporting back to the user
    const row = rows[i];
    try {
      const name = cell(row, idx.name);
      const companyNameRaw = cell(row, idx.company);
      if (!name || !companyNameRaw) {
        result.skippedInvalidRows += 1;
        continue;
      }

      const { firstName, lastName } = splitName(name);
      const repName = cell(row, idx.istRep);
      const repId = userIdByName.get(repName.toLowerCase()) ?? req.user!.sub;
      // SDR defaults to the importing/assigned rep when the file has no distinct SDR column.
      const sdrName = cell(row, idx.sdr);
      const sdrId = sdrName ? (userIdByName.get(sdrName.toLowerCase()) ?? repId) : repId;

      // Company — dedupe by name (case-insensitive), same convention used
      // everywhere else in the app (leads.service.ts resolveCompanyAndContact).
      const companyName = companyNameRaw.split(',')[0].trim(); // strip trailing "City, State, USA" some rows include
      let company = await db.query.companies.findFirst({ where: ilike(companies.name, companyName) });
      if (!company) {
        const revenueRaw = cell(row, idx.revenue).replace(/[^0-9.]/g, '');
        const [createdCompany] = await db
          .insert(companies)
          .values({
            name: companyName,
            city: cell(row, idx.city) || null,
            state: cell(row, idx.state) || null,
            country: cell(row, idx.country) || null,
            industry: cell(row, idx.industry) || null,
            website: normalizeWebsite(cell(row, idx.website) || null),
            annualRevenue: revenueRaw || undefined,
            createdById: repId,
          })
          .returning();
        company = createdCompany;
      }

      // Contact — dedupe by email when present; otherwise by (name + company)
      // so re-importing a file that has no email column doesn't create a
      // fresh duplicate contact for the same person every time.
      const emailRaw = cell(row, idx.email);
      const email = emailRaw ? emailRaw.toLowerCase() : null;
      let contact = email ? await db.query.contacts.findFirst({ where: ilike(contacts.email, email) }) : undefined;
      if (!contact && !email) {
        contact = await db.query.contacts.findFirst({
          where: and(eq(contacts.companyId, company.id), ilike(contacts.firstName, firstName), ilike(contacts.lastName, lastName)),
        });
      }
      if (!contact) {
        const [createdContact] = await db
          .insert(contacts)
          .values({
            companyId: company.id,
            firstName,
            lastName,
            designation: cell(row, idx.designation) || null,
            email,
            phone: cell(row, idx.phone) || null,
            city: cell(row, idx.city) || null,
            state: cell(row, idx.state) || null,
            country: cell(row, idx.country) || null,
            isPrimary: true,
            createdById: repId,
          })
          .returning();
        contact = createdContact;
      }

      // Skip creating a duplicate lead if this exact company+contact pair
      // already has an active lead — makes it safe to re-import an updated
      // version of the same file without piling up repeat rows.
      const existingLead = await db.query.leads.findFirst({
        where: and(eq(leads.companyId, company.id), eq(leads.contactId, contact.id), eq(leads.isActive, true)),
      });
      if (existingLead) {
        result.skippedDuplicates += 1;
        continue;
      }

      // Campaign — dedupe by code.
      const campaignCode = cell(row, idx.campaign);
      let campaignId: string | undefined;
      if (campaignCode) {
        if (!campaignByCode.has(campaignCode)) {
          let campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.code, campaignCode) });
          if (!campaign) {
            const [createdCampaign] = await db.insert(campaigns).values({ name: campaignCode, code: campaignCode, createdById: req.user!.sub }).returning();
            campaign = createdCampaign;
          }
          campaignByCode.set(campaignCode, campaign.id);
        }
        campaignId = campaignByCode.get(campaignCode);
      }

      const sourceRaw = cell(row, idx.source).toLowerCase();
      const source = sourceRaw.includes('linkedin') ? 'LINKEDIN' : sourceRaw.includes('email') ? 'EMAIL' : sourceRaw.includes('cold') ? 'COLD_CALLING' : 'OTHER';

      const comment = cell(row, idx.emailResponse);
      const explicitStatus = cell(row, idx.status).toUpperCase().replace(/\s+/g, '_');
      const { leadStatus, meetingStatus, meetingType } = classifyOutcome(comment);
      const status = LEAD_STATUSES.has(explicitStatus) ? explicitStatus : leadStatus;
      const meetingDate = parseFlexibleDate(idx.meetingDate >= 0 ? row[idx.meetingDate] : null);
      const receivedDate = parseFlexibleDate(idx.leadReceivedDate >= 0 ? row[idx.leadReceivedDate] : null);

      const [lead] = await db
        .insert(leads)
        .values({
          companyId: company.id,
          contactId: contact.id,
          campaignId,
          source: source as any,
          status: status as any,
          category: cell(row, idx.category) || null,
          emailResponse: comment || null,
          assignedToId: repId,
          currentOwnerId: repId,
          sdrId,
          leadReceivedDate: receivedDate ?? undefined,
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
        description: `Lead imported from "${file.originalname}" for ${companyName}`,
        leadId: lead.id,
        userId: repId,
        createdAt: meetingDate ?? new Date(),
      });

      result.created += 1;
    } catch (err) {
      result.errors.push({ row: rowNumber, message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  // Dashboard KPIs/pipeline/source-breakdown are cached — clear so the newly
  // imported leads show up immediately instead of after the 60s TTL.
  await cache.del('dashboard:*');
  await recordAudit({
    req,
    action: 'CREATE',
    entityType: 'Lead',
    newValues: { importedFile: file.originalname, ...result, errors: undefined /* keep the audit row compact */ },
  });

  return result;
}
