import { Request } from 'express';
import crypto from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { apiKeys } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { orgId } from '@/utils/tenant';
import { recordAudit } from '@/utils/auditLogger';
import { hashToken } from '@/utils/tokens';
import { PermissionKey } from '@/utils/permissions';

// Phase 11 (API/integrations), slice 1. Keys are immutable once created — there is no
// updateApiKey: to change a key's name or permission grants, revoke it and create a new one. This
// keeps the model simple (no "what does editing permissions on a live credential mean for
// requests already in flight" question to answer) and matches how most external API-key products
// behave in practice.

const KEY_PREFIX = 'sdrk_live_';

/** Fields ever returned from a list/read — keyHash is never selected here, on principle, even
 * though the API layer wouldn't render it either; a field that's simply never fetched can't leak
 * through a future refactor that forgets to strip it before responding. */
function selectableColumns() {
  return {
    id: apiKeys.id,
    name: apiKeys.name,
    keyPrefix: apiKeys.keyPrefix,
    permissions: apiKeys.permissions,
    createdById: apiKeys.createdById,
    lastUsedAt: apiKeys.lastUsedAt,
    revokedAt: apiKeys.revokedAt,
    createdAt: apiKeys.createdAt,
    updatedAt: apiKeys.updatedAt,
  };
}

export async function listApiKeys(req: Request) {
  const org = orgId(req);
  return db
    .select(selectableColumns())
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, org))
    .orderBy(desc(apiKeys.createdAt));
}

export async function createApiKey(req: Request, name: string, permissionKeys: PermissionKey[]) {
  const org = orgId(req);
  const userId = req.user!.sub;

  const secret = crypto.randomBytes(32).toString('hex');
  const fullKey = `${KEY_PREFIX}${secret}`;
  const keyHash = hashToken(fullKey);
  const keyPrefix = fullKey.slice(0, KEY_PREFIX.length + 8);

  const [created] = await db
    .insert(apiKeys)
    .values({ organizationId: org, name, keyPrefix, keyHash, permissions: permissionKeys, createdById: userId })
    .returning(selectableColumns());

  await recordAudit({ req, action: 'CREATE', entityType: 'ApiKey', entityId: created.id, newValues: { name, permissions: permissionKeys } });

  // The only point in this key's life the plaintext secret ever exists outside the caller's own
  // clipboard — never stored, never logged, never returned again by any other endpoint.
  return { ...created, key: fullKey };
}

export async function revokeApiKey(req: Request, id: string) {
  const org = orgId(req);
  const existing = await db.query.apiKeys.findFirst({ where: and(eq(apiKeys.id, id), eq(apiKeys.organizationId, org)) });
  if (!existing) throw ApiError.notFound('API key not found');

  // Revoking an already-revoked key is a no-op, not an error — same idempotency precedent as
  // dashboardWidgets.service.ts's pinReport, just for the opposite direction (turning access off
  // rather than on). The original revokedAt is preserved rather than bumped to "now" again.
  if (!existing.revokedAt) {
    await db.update(apiKeys).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(apiKeys.id, id));
    await recordAudit({ req, action: 'DELETE', entityType: 'ApiKey', entityId: id, oldValues: { name: existing.name } });
  }
}
