import { Request } from 'express';
import { and, eq, ilike } from 'drizzle-orm';
import { db } from '@/config/db';
import { companies, contacts } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { readSpreadsheetRows, findColumn, splitName } from '@/utils/spreadsheetImport';
import { normalizeWebsite } from '@/utils/leadFormOptions';
import { orgId } from '@/utils/tenant';

export interface CompanyImportResult {
  totalDataRows: number;
  companiesCreated: number;
  contactsCreated: number;
  skippedDuplicateContacts: number;
  skippedInvalidRows: number;
  errors: { row: number; message: string }[];
}

function cell(row: (string | number | boolean | Date | null)[], idx: number): string {
  if (idx < 0) return '';
  const v = row[idx];
  if (v == null) return '';
  return String(v).trim();
}

/**
 * Bulk-import Companies (and, optionally, one Contact per row) from a CSV/Excel file — the
 * standalone counterpart to leads.import.service.ts's importLeadsFromFile, for the case where a
 * team just has a list of accounts/contacts to load rather than full lead records. Deliberately
 * does NOT touch leads/campaigns/meetings at all (unlike lead import, which creates those as a
 * side effect) — this is scoped to exactly the two entities it's named for. Only a "Company"
 * column is required; every other column, including the contact ones, is optional per row.
 */
export async function importCompaniesFromFile(req: Request, file: Express.Multer.File): Promise<CompanyImportResult> {
  const org = orgId(req);
  const { headers, rows } = await readSpreadsheetRows(file.buffer, file.originalname, file.mimetype);

  const idx = {
    company: findColumn(headers, ['Company', 'Company Name']),
    domain: findColumn(headers, ['Domain']),
    website: findColumn(headers, ['Website', 'Website URL']),
    industry: findColumn(headers, ['Industry']),
    size: findColumn(headers, ['Company Size', 'Size']),
    revenue: findColumn(headers, ['Revenue', 'Annual Revenue']),
    companyPhone: findColumn(headers, ['Company Phone', 'Phone']),
    city: findColumn(headers, ['City']),
    state: findColumn(headers, ['State']),
    country: findColumn(headers, ['Country']),
    name: findColumn(headers, ['Contact Name', 'Name', 'Full Name']),
    designation: findColumn(headers, ['Designation', 'Title', 'Job Title']),
    email: findColumn(headers, ['Email', 'Email ID', 'Email Address']),
    contactPhone: findColumn(headers, ['Contact Phone', 'Mobile']),
  };

  if (idx.company === -1) {
    throw ApiError.badRequest(
      `Couldn't find a required "Company" column in the file — found: ${headers.filter(Boolean).join(', ') || '(no headers detected)'}`
    );
  }

  const result: CompanyImportResult = {
    totalDataRows: rows.length,
    companiesCreated: 0,
    contactsCreated: 0,
    skippedDuplicateContacts: 0,
    skippedInvalidRows: 0,
    errors: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2; // account for the header row when reporting back to the user
    const row = rows[i];
    try {
      const companyNameRaw = cell(row, idx.company);
      if (!companyNameRaw) {
        result.skippedInvalidRows += 1;
        continue;
      }
      // Strip trailing "City, State, USA" some exported rows include, same convention as
      // leads.import.service.ts's own company-name cleanup.
      const companyName = companyNameRaw.split(',')[0].trim();

      // Company — dedupe by name (case-insensitive), same convention used everywhere else in the
      // app (leads.service.ts resolveCompanyAndContact, leads.import.service.ts).
      let company = await db.query.companies.findFirst({
        where: and(eq(companies.organizationId, org), ilike(companies.name, companyName)),
      });
      if (!company) {
        const revenueRaw = cell(row, idx.revenue).replace(/[^0-9.]/g, '');
        const [created] = await db
          .insert(companies)
          .values({
            organizationId: org,
            name: companyName,
            domain: cell(row, idx.domain) || null,
            website: normalizeWebsite(cell(row, idx.website) || null),
            industry: cell(row, idx.industry) || null,
            companySize: cell(row, idx.size) || null,
            annualRevenue: revenueRaw || undefined,
            phone: cell(row, idx.companyPhone) || null,
            city: cell(row, idx.city) || null,
            state: cell(row, idx.state) || null,
            country: cell(row, idx.country) || null,
            createdById: req.user!.sub,
          })
          .returning();
        company = created;
        result.companiesCreated += 1;
      }

      // The contact columns are all optional — a row can import a company with no named contact
      // at all, unlike lead import where a Name is required on every row.
      const contactNameRaw = cell(row, idx.name);
      if (!contactNameRaw) continue;

      const { firstName, lastName } = splitName(contactNameRaw);
      const emailRaw = cell(row, idx.email);
      const email = emailRaw ? emailRaw.toLowerCase() : null;

      // Contact — dedupe by email when present; otherwise by (name + company), same convention as
      // leads.import.service.ts.
      const existingContact = email
        ? await db.query.contacts.findFirst({ where: and(eq(contacts.organizationId, org), ilike(contacts.email, email)) })
        : await db.query.contacts.findFirst({
            where: and(
              eq(contacts.organizationId, org),
              eq(contacts.companyId, company.id),
              ilike(contacts.firstName, firstName),
              ilike(contacts.lastName, lastName)
            ),
          });
      if (existingContact) {
        result.skippedDuplicateContacts += 1;
        continue;
      }

      await db.insert(contacts).values({
        organizationId: org,
        companyId: company.id,
        firstName,
        lastName,
        designation: cell(row, idx.designation) || null,
        email,
        phone: cell(row, idx.contactPhone) || null,
        city: cell(row, idx.city) || null,
        state: cell(row, idx.state) || null,
        country: cell(row, idx.country) || null,
        isPrimary: true,
        createdById: req.user!.sub,
      });
      result.contactsCreated += 1;
    } catch (err) {
      result.errors.push({ row: rowNumber, message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  await recordAudit({
    req,
    action: 'CREATE',
    entityType: 'Company',
    newValues: { importedFile: file.originalname, ...result, errors: undefined /* keep the audit row compact */ },
  });

  return result;
}
