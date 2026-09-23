import { Request } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/config/db';
import { connectorInstances } from '@/db/schema';
import { ApiError } from '@/utils/ApiError';
import { orgId } from '@/utils/tenant';
import { recordAudit } from '@/utils/auditLogger';
import { encryptToken, decryptToken } from '@/utils/tokenCrypto';
import { tokenEncryptionEnabled } from '@/config/env';
import { CONNECTOR_PROVIDERS, findProvider } from './connectorProviders';

// Phase 11 (API/integrations), slice 3. See db/schema.ts's connectorInstances table comment and
// connectorProviders.ts's own module comment for the full "groundwork, not a live integration"
// rationale — nothing here ever calls out to Slack/HubSpot/Zoom.

const MASKED_VALUE = '••••••••';

function requireEncryption() {
  if (!tokenEncryptionEnabled) {
    throw ApiError.badRequest(
      'This server has no TOKEN_ENCRYPTION_KEY configured, so connector config (which typically holds a real credential) cannot be stored safely. Ask an operator to set TOKEN_ENCRYPTION_KEY before adding a connector.'
    );
  }
}

function maskConfig(providerId: string, config: Record<string, string>): Record<string, string> {
  const provider = findProvider(providerId);
  // Defensive fallback if a provider was ever removed from the catalog after an instance using it
  // was created — return as-is rather than guessing which fields to mask.
  if (!provider) return config;
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    const field = provider.configFields.find((f) => f.key === key);
    masked[key] = field?.type === 'secret' && value ? MASKED_VALUE : value;
  }
  return masked;
}

function decryptConfig(configEnc: string): Record<string, string> {
  try {
    return JSON.parse(decryptToken(configEnc));
  } catch {
    // Ciphertext from before TOKEN_ENCRYPTION_KEY was rotated, or genuine tampering — surfacing a
    // masked-everything placeholder is safer than throwing and breaking the whole list endpoint
    // over one bad row.
    return {};
  }
}

/** The fixed provider catalog — same role as GET /permissions for the roles/API-key checklists. */
export function listProviders() {
  return CONNECTOR_PROVIDERS;
}

interface ConnectorInstanceRow {
  id: string;
  providerId: string;
  name: string;
  configEnc: string;
  isActive: boolean;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function selectableColumns() {
  return {
    id: connectorInstances.id,
    providerId: connectorInstances.providerId,
    name: connectorInstances.name,
    configEnc: connectorInstances.configEnc,
    isActive: connectorInstances.isActive,
    createdById: connectorInstances.createdById,
    createdAt: connectorInstances.createdAt,
    updatedAt: connectorInstances.updatedAt,
  };
}

function toResponse(row: ConnectorInstanceRow) {
  const { configEnc, ...rest } = row;
  return { ...rest, config: maskConfig(row.providerId, decryptConfig(configEnc)) };
}

export async function listConnectorInstances(req: Request) {
  const org = orgId(req);
  const rows = await db
    .select(selectableColumns())
    .from(connectorInstances)
    .where(eq(connectorInstances.organizationId, org))
    .orderBy(desc(connectorInstances.createdAt));
  return rows.map(toResponse);
}

export async function createConnectorInstance(req: Request, providerId: string, name: string, config: Record<string, string>) {
  requireEncryption();
  const org = orgId(req);
  const userId = req.user!.sub;

  const configEnc = encryptToken(JSON.stringify(config));
  const [created] = await db
    .insert(connectorInstances)
    .values({ organizationId: org, providerId, name, configEnc, createdById: userId })
    .returning(selectableColumns());

  await recordAudit({ req, action: 'CREATE', entityType: 'ConnectorInstance', entityId: created.id, newValues: { providerId, name } });

  return toResponse(created);
}

export async function updateConnectorInstance(
  req: Request,
  id: string,
  updates: { name?: string; config?: Record<string, string>; isActive?: boolean }
) {
  const org = orgId(req);
  const existing = await db.query.connectorInstances.findFirst({ where: and(eq(connectorInstances.id, id), eq(connectorInstances.organizationId, org)) });
  if (!existing) throw ApiError.notFound('Connector instance not found');

  const values: Partial<typeof connectorInstances.$inferInsert> = { updatedAt: new Date() };
  if (updates.name !== undefined) values.name = updates.name;
  if (updates.isActive !== undefined) values.isActive = updates.isActive;

  if (updates.config !== undefined) {
    requireEncryption();
    const provider = findProvider(existing.providerId);
    // The UI never has the real value of an existing secret field to redisplay (only the masked
    // placeholder — see maskConfig), so it can't "resubmit unchanged" the way it does for a plain
    // text field. Leaving a secret field blank on an update therefore means "keep the current
    // value", not "clear it" — the same convention most account-settings password fields use.
    // Non-secret fields don't get this treatment: an update always replaces them with exactly
    // what was submitted, blank included, since the UI CAN show their real current value.
    const merged = { ...updates.config };
    if (provider) {
      const existingConfig = decryptConfig(existing.configEnc);
      for (const field of provider.configFields) {
        if (field.type === 'secret' && !merged[field.key]?.trim()) {
          merged[field.key] = existingConfig[field.key] ?? '';
        }
      }
      for (const field of provider.configFields) {
        if (field.required && !merged[field.key]?.trim()) {
          throw ApiError.badRequest(`${field.label} is required`);
        }
      }
    }
    values.configEnc = encryptToken(JSON.stringify(merged));
  }

  const [updated] = await db.update(connectorInstances).set(values).where(eq(connectorInstances.id, id)).returning(selectableColumns());

  await recordAudit({
    req,
    action: 'UPDATE',
    entityType: 'ConnectorInstance',
    entityId: id,
    oldValues: { name: existing.name, isActive: existing.isActive },
    newValues: { name: updated.name, isActive: updated.isActive, configChanged: updates.config !== undefined },
  });

  return toResponse(updated);
}

export async function deleteConnectorInstance(req: Request, id: string) {
  const org = orgId(req);
  const existing = await db.query.connectorInstances.findFirst({ where: and(eq(connectorInstances.id, id), eq(connectorInstances.organizationId, org)) });
  if (!existing) throw ApiError.notFound('Connector instance not found');

  await db.delete(connectorInstances).where(eq(connectorInstances.id, id));
  await recordAudit({ req, action: 'DELETE', entityType: 'ConnectorInstance', entityId: id, oldValues: { providerId: existing.providerId, name: existing.name } });
}
