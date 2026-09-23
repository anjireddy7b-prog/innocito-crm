import { Router } from 'express';
import { and, eq, ilike, or, SQL } from 'drizzle-orm';
import { authenticate } from '@/middleware/auth';
import { asyncHandler } from '@/utils/asyncHandler';
import { db } from '@/config/db';
import { leads, companies, contacts, campaigns, users, cases, knowledgeArticles } from '@/db/schema';
import { formatLeadNumber, parseLeadNumber } from '@/utils/leadNumber';
import { formatCaseNumber } from '@/modules/cases/cases.service';
import { ApiError } from '@/utils/ApiError';
import { PERMISSIONS } from '@/utils/permissions';
import { orgId } from '@/utils/tenant';

export const searchRouter = Router();
searchRouter.use(authenticate);

/**
 * Global instant search — queries Leads, Companies, Contacts, Campaigns, assignable Users (sales
 * reps), Cases, and Knowledge Base articles in parallel and returns grouped, capped result sets
 * for the top-nav autocomplete dropdown. Cases and Knowledge Base articles were deliberately left
 * out when their modules first shipped (Phase 9's Sections W/X) and are added here as the
 * "search hardening" slice of the same phase.
 */
searchRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const org = orgId(req);
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) throw ApiError.badRequest('Search query must be at least 2 characters');
    const term = `%${q}%`;
    const leadNumber = parseLeadNumber(q);
    // Same visibility rule as knowledgeBase.service.ts's own listArticles/getArticleById: a
    // caller without KNOWLEDGE_BASE_MANAGE only ever matches PUBLISHED articles here — a DRAFT
    // article's existence isn't disclosed via search any more than it is via the list/detail
    // endpoints.
    const canManageKnowledgeBase = req.user!.permissions.includes(PERMISSIONS.KNOWLEDGE_BASE_MANAGE);

    const [leadRows, companyRows, contactRows, campaignRows, userRows, caseRows, articleRows] = await Promise.all([
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
            eq(leads.organizationId, org),
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
        where: and(
          eq(companies.organizationId, org),
          or(ilike(companies.name, term), ilike(companies.domain, term), ilike(companies.country, term), ilike(companies.industry, term), ilike(companies.website, term))
        ),
        limit: 6,
      }),
      db.query.contacts.findMany({
        where: and(
          eq(contacts.organizationId, org),
          or(ilike(contacts.firstName, term), ilike(contacts.lastName, term), ilike(contacts.email, term), ilike(contacts.phone, term))
        ),
        limit: 6,
        with: { company: { columns: { name: true } } },
      }),
      db.query.campaigns.findMany({
        where: and(eq(campaigns.organizationId, org), or(ilike(campaigns.name, term), ilike(campaigns.code, term))),
        limit: 5,
      }),
      db.query.users.findMany({
        where: and(
          eq(users.organizationId, org),
          eq(users.isActive, true),
          or(ilike(users.firstName, term), ilike(users.lastName, term), ilike(users.email, term))
        ),
        limit: 5,
        columns: { id: true, firstName: true, lastName: true, email: true },
        with: { role: { columns: { name: true } } },
      }),
      db.query.cases.findMany({
        where: and(
          eq(cases.organizationId, org),
          or(ilike(cases.subject, term), ilike(cases.description, term))
        ),
        limit: 6,
        columns: { id: true, caseNumber: true, subject: true, status: true },
      }),
      db.query.knowledgeArticles.findMany({
        where: and(
          eq(knowledgeArticles.organizationId, org),
          ...(canManageKnowledgeBase ? [] : [eq(knowledgeArticles.status, 'PUBLISHED' as const)]),
          or(ilike(knowledgeArticles.title, term), ilike(knowledgeArticles.content, term))
        ),
        limit: 6,
        columns: { id: true, title: true, category: true, status: true },
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
        cases: caseRows.map((c) => ({ id: c.id, displayId: formatCaseNumber(c.caseNumber), subject: c.subject, status: c.status })),
        knowledgeArticles: articleRows,
      },
    });
  })
);
