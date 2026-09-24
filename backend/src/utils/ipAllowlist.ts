import { eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { ipAllowlistEntries } from '@/db/schema';
import { cache } from '@/config/redis';

// Phase 15 (security hardening) — org-level IP allowlisting. IPv4-only for v1: no dependency is
// pulled in for full IPv4+IPv6 CIDR parsing (a real, non-trivial amount of code to get right —
// see e.g. the node-ipaddr.js/netmask packages this deliberately does NOT add), and every
// existing caller of isIpAllowed already only ever has an IPv4 remote address in practice
// (Railway's edge, like most cloud load balancers, presents IPv4 to the origin even for an IPv6
// client). A genuinely IPv6-only caller would fail to match any entry and be denied — fail
// CLOSED, which is the safe direction for a security control, even though it's not yet a graceful
// one. Revisit if that ever becomes a real complaint rather than a theoretical gap.

/** "::ffff:203.0.113.5" (IPv4-mapped-IPv6, what Node gives on a dual-stack socket) -> "203.0.113.5". */
function stripIpv4MappedPrefix(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    // Reject anything Number() would parse loosely (leading '+', whitespace, "0x1", "1e2", ...) —
    // an octet is 1-3 decimal digits or nothing else.
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

/** Format check for a value before it's ever stored — see ipAllowlist.validation.ts. Deliberately
 * separate from ipMatchesCidr below rather than inferring validity from whether some fixed probe
 * IP happens to match it: a well-formed cidr that simply doesn't match a given probe is not the
 * same thing as a malformed one, and conflating them would let garbage input slip through as long
 * as it happened to not match by coincidence. */
export function isValidCidr(cidr: string): boolean {
  const [rangeIp, prefixStr] = cidr.split('/');
  if (ipv4ToInt(rangeIp) === null) return false;
  if (prefixStr === undefined) return true;
  const prefix = Number(prefixStr);
  return /^\d{1,2}$/.test(prefixStr) && prefix >= 0 && prefix <= 32;
}

/** True if `ip` (a plain dotted-quad) falls within `cidr` (a dotted-quad, optionally with a `/prefix`; no `/` means a single host, i.e. an implicit /32). */
export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const [rangeIp, prefixStr] = cidr.split('/');
  const prefix = prefixStr === undefined ? 32 : Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;

  const ipInt = ipv4ToInt(stripIpv4MappedPrefix(ip));
  const rangeInt = ipv4ToInt(rangeIp);
  if (ipInt === null || rangeInt === null) return false;

  if (prefix === 0) return true; // 0.0.0.0/0 — matches everything, deliberately allowed (an org's own explicit choice)
  // 32-bit shifts in JS wrap at 32 (x << 32 === x), so the prefix===32 case is spelled out rather
  // than relying on the general formula below to also happen to work at that boundary.
  const mask = prefix === 32 ? 0xffffffff : (~((1 << (32 - prefix)) - 1) >>> 0);
  return (ipInt & mask) === (rangeInt & mask);
}

// Phase 15 (scale readiness) — isIpAllowed is called from middleware/auth.ts's authenticate on
// EVERY authenticated request across the entire app (not just IP-allowlist-specific routes),
// since there's no cheaper way to know in advance whether a given org is even restricted. For
// the overwhelming majority of organizations (zero entries — see below), that would otherwise be
// one extra Postgres round trip on the hottest path in the app, forever, for a feature they never
// turned on. Cached the same way dashboard.service.ts/platformAdmin.service.ts cache their own
// expensive reads — short TTL, explicit invalidation on the writes that can change the answer
// (ipAllowlist.service.ts's createEntry/deleteEntry), so the common case costs a Redis lookup
// instead of a database query.
const CACHE_TTL_SECONDS = 30;
function allowlistCacheKey(organizationId: string) {
  return `ip-allowlist:${organizationId}`;
}

export async function invalidateIpAllowlistCache(organizationId: string): Promise<void> {
  await cache.del(allowlistCacheKey(organizationId));
}

async function loadEntries(organizationId: string): Promise<{ cidr: string }[]> {
  const cached = await cache.get<{ cidr: string }[]>(allowlistCacheKey(organizationId));
  if (cached !== null) return cached;
  const entries = await db.query.ipAllowlistEntries.findMany({
    where: eq(ipAllowlistEntries.organizationId, organizationId),
    columns: { cidr: true },
  });
  await cache.set(allowlistCacheKey(organizationId), entries, CACHE_TTL_SECONDS);
  return entries;
}

/**
 * An organization with zero rows in ip_allowlist_entries is unrestricted (returns true for any
 * IP) — the allowlist only starts enforcing once an Admin adds its first entry, so creating this
 * feature changed nothing for any existing organization. Called from two places that both need
 * the exact same answer: middleware/auth.ts's authenticate (every subsequent authenticated
 * request) and auth.service.ts's login (so a disallowed network can't even obtain a session in
 * the first place, not just get blocked on the next call).
 */
export async function isIpAllowed(organizationId: string, ip: string | undefined): Promise<boolean> {
  const entries = await loadEntries(organizationId);
  if (entries.length === 0) return true;
  if (!ip) return false; // restricted org, no client IP to check (shouldn't happen behind Railway's proxy) — fail closed
  return entries.some((entry) => ipMatchesCidr(ip, entry.cidr));
}
