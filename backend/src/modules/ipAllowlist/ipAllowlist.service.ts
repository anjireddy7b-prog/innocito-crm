import { Request } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { ipAllowlistEntries } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { orgId } from '@/utils/tenant';
import { recordAudit } from '@/utils/auditLogger';
import { isIpAllowed, invalidateIpAllowlistCache } from '@/utils/ipAllowlist';

// Phase 15 (security hardening). Enforcement itself (isIpAllowed) lives in utils/ipAllowlist.ts,
// shared between middleware/auth.ts's authenticate and auth.service.ts's login — this file is
// only the CRUD an Admin uses to manage the list those two consult. See db/schema.ts's
// ipAllowlistEntries comment for why zero rows means "unrestricted."

export async function listEntries(req: Request) {
  const org = orgId(req);
  return db.query.ipAllowlistEntries.findMany({ where: eq(ipAllowlistEntries.organizationId, org), orderBy: desc(ipAllowlistEntries.createdAt) });
}

export async function createEntry(req: Request, cidr: string, label: string | undefined) {
  const org = orgId(req);
  const userId = req.user!.sub;

  const [created] = await db
    .insert(ipAllowlistEntries)
    .values({ organizationId: org, cidr, label, createdById: userId })
    .returning();
  // Must invalidate before the isIpAllowed check below — otherwise that check could read a cache
  // entry from just before this insert (up to CACHE_TTL_SECONDS stale) and never see the new row.
  await invalidateIpAllowlistCache(org);

  // Safety net: never let this call lock the whole organization out — including the Admin who
  // just made it — by adding a range that doesn't cover their OWN current request IP. Checked
  // after inserting, against the real resulting set (not just this one new row), because whether
  // this locks anyone out depends on every other entry too, not this field in isolation; if it
  // would, the insert is undone and the caller gets a clear reason rather than a range silently
  // sitting there until the next login fails for everyone with no in-app way back short of a
  // platform admin or direct DB access.
  const stillAllowed = await isIpAllowed(org, req.ip);
  if (!stillAllowed) {
    await db.delete(ipAllowlistEntries).where(eq(ipAllowlistEntries.id, created.id));
    // The check above just re-cached the (about to be wrong) "with the new row" list — invalidate
    // again so the next real request re-fetches the now-actually-correct (rolled-back) state.
    await invalidateIpAllowlistCache(org);
    throw ApiError.badRequest(
      `That range doesn't include your current IP (${req.ip}) — adding it would lock your whole organization out, including you. Add a range that covers your own IP first.`
    );
  }

  await recordAudit({ req, action: 'CREATE', entityType: 'IpAllowlistEntry', entityId: created.id, newValues: { cidr, label } });
  return created;
}

export async function deleteEntry(req: Request, id: string) {
  const org = orgId(req);
  const existing = await db.query.ipAllowlistEntries.findFirst({ where: and(eq(ipAllowlistEntries.id, id), eq(ipAllowlistEntries.organizationId, org)) });
  if (!existing) throw ApiError.notFound('Entry not found');

  await db.delete(ipAllowlistEntries).where(eq(ipAllowlistEntries.id, id));
  await invalidateIpAllowlistCache(org);

  // Same lockout safety net as createEntry above, mirrored for the opposite direction: deleting
  // down to ZERO remaining entries is always safe (that's just "unrestricted" again), but
  // deleting one entry while others remain could still strand the caller if none of the survivors
  // cover their current IP. Restore the row and refuse rather than let that request be the last
  // one this admin's own account can ever make against this organization.
  const stillAllowed = await isIpAllowed(org, req.ip);
  if (!stillAllowed) {
    await db.insert(ipAllowlistEntries).values({ id: existing.id, organizationId: existing.organizationId, cidr: existing.cidr, label: existing.label, createdById: existing.createdById, createdAt: existing.createdAt });
    await invalidateIpAllowlistCache(org);
    throw ApiError.badRequest(
      `Removing this range would lock your whole organization out, including you (your current IP, ${req.ip}, isn't covered by what would remain). Add a range that covers your own IP before removing this one.`
    );
  }

  await recordAudit({ req, action: 'DELETE', entityType: 'IpAllowlistEntry', entityId: id, oldValues: { cidr: existing.cidr, label: existing.label } });
}
