import { Router } from 'express';
import { and, eq, ilike, or, SQL } from 'drizzle-orm';
import { authenticate } from '@/middleware/auth';
import { asyncHandler } from '@/utils/asyncHandler';
import { db } from '@/config/db';
import { leads, companies, contacts, campaigns, users } from '@/db/schema';
import { formatLeadNumber, parseLeadNumber } from '@/utils/leadNumber';
import { ApiError } from '@/utils/ApiError';

export const searchRouter = Router();
searchRouter.use(authenticate);

/**
 * Global instant search — queries Leads, Companies, Contacts, Campaigns and
 * assignable Users (sales reps) in parallel and returns grouped, capped
 * result sets for the top-nav autocomplete dropdown.
 */
searchRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) throw ApiError.badRequest('Search query must be at least 2 characters');
    const term = `%${q}%`;
    const leadNumber = parseLeadNumber(q);

    const [leadRows, companyRows, contactRows, campaignRows, userRows] = await Promise.all([
      db
        .select({
          id: leads.id,
          leadNumber: leads.leadNumber,
          status: leads.status,
          companyName: companies.name,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
        })
        .from(leads)
        .leftJoin(companies, eq(leads.companyId, companies.id))
        .leftJoin(contacts, eq(leads.contactId, contacts.id))
        .where(
          and(
            eq(leads.isActive, true),
            or(
              ...(leadNumber !== null ? [eq(leads.leadNumber, leadNumber)] : []),
              ilike(companies.name, term),
              ilike(companies.domain, term),
              ilike(contacts.firstName, term),
              ilike(contacts.lastName, term),
              ilike(contacts.email, term),
              ilike(contacts.phone, term),
              ilike(leads.emailResponse, term)
            )!
          )
        )
        .limit(8),
      db.query.companies.findMany({
        where: or(ilike(companies.name, term), ilike(companies.domain, term), ilike(companies.country, term), ilike(companies.industry, term), ilike(companies.website, term)),
        limit: 6,
      }),
      db.query.contacts.findMany({
        where: or(ilike(contacts.firstName, term), ilike(contacts.lastName, term), ilike(contacts.email, term), ilike(contacts.phone, term)),
        limit: 6,
        with: { company: { columns: { name: true } } },
      }),
      db.query.campaigns.findMany({ where: or(ilike(campaigns.name, term), ilike(campaigns.code, term)), limit: 5 }),
      db.query.users.findMany({
        where: and(
          eq(users.isActive, true),
          or(ilike(users.firstName, term), ilike(users.lastName, term), ilike(users.email, term))
        ),
        limit: 5,
        columns: { id: true, firstName: true, lastName: true, email: true },
        with: { role: { columns: { name: true } } },
      }),
    ]);

    res.json({
      success: true,
      data: {
        leads: leadRows.map((l) => ({
          id: l.id,
          displayId: formatLeadNumber(l.leadNumber),
          title: l.companyName ?? [l.contactFirstName, l.contactLastName].filter(Boolean).join(' ') ?? formatLeadNumber(l.leadNumber),
          status: l.status,
        })),
        companies: companyRows,
        contacts: contactRows,
        campaigns: campaignRows,
        salesReps: userRows,
      },
    });
  })
);
