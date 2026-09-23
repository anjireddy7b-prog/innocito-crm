import { Request } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { companies, contacts, leads, documents, activities } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { recordAudit } from '@/utils/auditLogger';
import { orgId } from '@/utils/tenant';
import { cache } from '@/config/redis';
import { PERMISSIONS } from '@/utils/permissions';
import { DuplicateEntityType } from './duplicates.validation';

// ----------------------------------------------------------------------------
// Phase 9 ("advanced CRM") — duplicate detection & merge, scoped to Companies and Contacts.
//
// The master report's Section K bundles "duplicate management" together with sequences,
// email/calendar integration, case management, knowledge base, and data quality under one
// "advanced CRM" phase (Sections 30-41). Sequences and email/calendar integration explicitly need
// OAuth token storage plus the background-job system the report calls for — the same job-queue
// infrastructure Phase 8 deliberately deferred (see validation_rules' own schema comment) because
// standing it up is a bigger, riskier change than one phase's budget on the current single-service
// Railway deployment. This increment implements only duplicate detection & merge, which needs no
// new infrastructure — it's a read-time query over existing data plus a transactional reassignment
// of foreign keys. The remaining "advanced CRM" pieces (sequences, email/calendar integration, case
// management, knowledge base, data-quality scoring) stay out of scope for now.
//
// Leads are deliberately excluded from merging (detection or otherwise): a Lead carries pipeline
// state (status, deal value, meetings/tasks/documents/comments of its own) that doesn't merge
// cleanly the way an address-book-style record does — two "duplicate" leads are better resolved by
// a rep manually closing one after review, not by an automated field-by-field merge. Companies and
// Contacts are the classic CRM dedup targets (this is also where Salesforce/HubSpot-style duplicate
// management focuses) and merge cleanly: a company/contact's identity IS the record, so surviving
// records just inherit the duplicate's children before the duplicate row is deleted.
// ----------------------------------------------------------------------------

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return cleaned || null;
}

/** Strips protocol/www/path/query from a domain or website value so "https://www.acme.com/" and "acme.com" match. */
function normalizeHost(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0];
  return cleaned || null;
}

/** Digits only; requires a minimum length so blank/near-empty phone values never bucket together. */
function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
}

/** Minimal union-find so records linked by ANY matcher end up in one connected-component group. */
class DisjointSet {
  private parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

interface DuplicateGroup<T> {
  matchedOn: string[];
  records: T[];
}

/**
 * Groups records into duplicate clusters: any two records sharing a non-null key from ANY matcher
 * end up in the same group (transitively — A~B via name and B~C via domain puts A, B, C in one
 * group). Computed in application code rather than SQL since an org's company/contact counts are
 * small enough (low thousands at most, for this app's scale) that a single fetch + in-memory group
 * is simpler and easier to reason about than a hand-rolled dedup SQL query.
 */
function groupDuplicates<T extends { id: string }>(
  records: T[],
  matchers: { label: string; keyOf: (r: T) => string | null }[]
): DuplicateGroup<T>[] {
  const dsu = new DisjointSet();
  records.forEach((r) => dsu.find(r.id));

  const labelsByRecordId = new Map<string, Set<string>>();

  for (const matcher of matchers) {
    const buckets = new Map<string, string[]>();
    for (const r of records) {
      const key = matcher.keyOf(r);
      if (!key) continue;
      const bucket = buckets.get(key) ?? [];
      bucket.push(r.id);
      buckets.set(key, bucket);
    }
    for (const ids of buckets.values()) {
      if (ids.length < 2) continue;
      for (let i = 1; i < ids.length; i++) dsu.union(ids[0], ids[i]);
      for (const id of ids) {
        const set = labelsByRecordId.get(id) ?? new Set<string>();
        set.add(matcher.label);
        labelsByRecordId.set(id, set);
      }
    }
  }

  const idsByRoot = new Map<string, string[]>();
  for (const r of records) {
    const root = dsu.find(r.id);
    const arr = idsByRoot.get(root) ?? [];
    arr.push(r.id);
    idsByRoot.set(root, arr);
  }

  const byId = new Map(records.map((r) => [r.id, r]));
  const groups: DuplicateGroup<T>[] = [];
  for (const ids of idsByRoot.values()) {
    if (ids.length < 2) continue;
    const matchedOn = new Set<string>();
    for (const id of ids) {
      const labels = labelsByRecordId.get(id);
      if (labels) labels.forEach((l) => matchedOn.add(l));
    }
    groups.push({ matchedOn: Array.from(matchedOn), records: ids.map((id) => byId.get(id)!) });
  }
  groups.sort((a, b) => b.records.length - a.records.length);
  return groups;
}

async function findCompanyDuplicateGroups(org: string) {
  const rows = await db.query.companies.findMany({
    where: eq(companies.organizationId, org),
    columns: { id: true, name: true, domain: true, website: true, industry: true, country: true, createdAt: true },
  });
  return groupDuplicates(rows, [
    { label: 'name', keyOf: (r) => normalizeText(r.name) },
    // Domain takes priority when set; falls back to a normalized website host so a bare domain on
    // one record and a full URL on another (same host) still land in the same bucket.
    { label: 'domain', keyOf: (r) => normalizeHost(r.domain) ?? normalizeHost(r.website) },
  ]);
}

async function findContactDuplicateGroups(org: string) {
  const rows = await db.query.contacts.findMany({
    where: eq(contacts.organizationId, org),
    columns: { id: true, firstName: true, lastName: true, email: true, phone: true, companyId: true, createdAt: true },
    with: { company: { columns: { id: true, name: true } } },
  });
  return groupDuplicates(rows, [
    { label: 'email', keyOf: (r) => normalizeText(r.email) },
    { label: 'phone', keyOf: (r) => normalizePhone(r.phone) },
  ]);
}

export async function listDuplicateGroups(org: string, entityType: DuplicateEntityType) {
  return entityType === 'COMPANY' ? findCompanyDuplicateGroups(org) : findContactDuplicateGroups(org);
}

async function mergeCompanies(req: Request, org: string, survivorId: string, duplicateId: string) {
  const [survivor, duplicate] = await Promise.all([
    db.query.companies.findFirst({ where: and(eq(companies.organizationId, org), eq(companies.id, survivorId)) }),
    db.query.companies.findFirst({ where: and(eq(companies.organizationId, org), eq(companies.id, duplicateId)) }),
  ]);
  if (!survivor) throw ApiError.notFound('Survivor company not found');
  if (!duplicate) throw ApiError.notFound('Duplicate company not found');

  await db.transaction(async (tx) => {
    await tx.update(contacts).set({ companyId: survivorId }).where(eq(contacts.companyId, duplicateId));
    await tx.update(leads).set({ companyId: survivorId }).where(eq(leads.companyId, duplicateId));
    // documents.companyId and activities.companyId cascade-delete on the company FK (see
    // db/schema.ts) — reassigning them BEFORE deleting the duplicate is what keeps a merge from
    // silently destroying the duplicate's attached files and activity history.
    await tx.update(documents).set({ companyId: survivorId }).where(eq(documents.companyId, duplicateId));
    await tx.update(activities).set({ companyId: survivorId }).where(eq(activities.companyId, duplicateId));
    await tx.delete(companies).where(eq(companies.id, duplicateId));
  });

  await recordAudit({
    req,
    action: 'MERGE',
    entityType: 'Company',
    entityId: duplicateId,
    oldValues: duplicate,
    newValues: { mergedInto: survivorId },
  });
  await cache.del('dashboard:*');
  return { survivorId, duplicateId };
}

async function mergeContacts(req: Request, org: string, survivorId: string, duplicateId: string) {
  const [survivor, duplicate] = await Promise.all([
    db.query.contacts.findFirst({ where: and(eq(contacts.organizationId, org), eq(contacts.id, survivorId)) }),
    db.query.contacts.findFirst({ where: and(eq(contacts.organizationId, org), eq(contacts.id, duplicateId)) }),
  ]);
  if (!survivor) throw ApiError.notFound('Survivor contact not found');
  if (!duplicate) throw ApiError.notFound('Duplicate contact not found');

  await db.transaction(async (tx) => {
    // activities.contactId cascade-deletes on the contact FK — reassign before deleting, same
    // reasoning as the company merge above.
    await tx.update(leads).set({ contactId: survivorId }).where(eq(leads.contactId, duplicateId));
    await tx.update(activities).set({ contactId: survivorId }).where(eq(activities.contactId, duplicateId));
    await tx.delete(contacts).where(eq(contacts.id, duplicateId));
  });

  await recordAudit({
    req,
    action: 'MERGE',
    entityType: 'Contact',
    entityId: duplicateId,
    oldValues: duplicate,
    newValues: { mergedInto: survivorId },
  });
  return { survivorId, duplicateId };
}

/**
 * Merging is exactly as consequential as deleting the entity type in question (it deletes
 * `duplicateId` after reassigning its children), so it's gated on the SAME permission that already
 * gates delete for that entity type — COMPANIES_MANAGE / CONTACTS_MANAGE — rather than a new
 * dedicated permission. Checked here (not via requirePermission in the router) since which
 * permission applies depends on the request body's entityType, decided per-request; mirrors
 * leads.service.ts's own in-service permission checks (see canEditLead).
 */
export async function mergeDuplicates(
  req: Request,
  input: { entityType: DuplicateEntityType; survivorId: string; duplicateId: string }
) {
  const org = orgId(req);
  const requiredPermission = input.entityType === 'COMPANY' ? PERMISSIONS.COMPANIES_MANAGE : PERMISSIONS.CONTACTS_MANAGE;
  if (!req.user!.permissions.includes(requiredPermission)) {
    throw ApiError.forbidden(`Missing required permission: ${requiredPermission}`);
  }

  return input.entityType === 'COMPANY'
    ? mergeCompanies(req, org, input.survivorId, input.duplicateId)
    : mergeContacts(req, org, input.survivorId, input.duplicateId);
}
