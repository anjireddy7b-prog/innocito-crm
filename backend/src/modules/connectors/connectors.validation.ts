import { z } from 'zod';
import { ALL_PROVIDER_IDS, findProvider } from './connectorProviders';

// Cast for zod's benefit only — same pattern as apiKeys.validation.ts's permissionKeySchema.
// ALL_PROVIDER_IDS is a real, non-empty array at runtime.
const providerIdSchema = z.enum(ALL_PROVIDER_IDS as [string, ...string[]]);

// Config values are always strings here (every field type — text/url/secret — is entered as
// plain text; there's no numeric/boolean config field in this catalog yet). Which keys are
// actually required is provider-specific, so that check runs in connectors.service.ts once the
// provider is resolved, not here — this schema only enforces the outer shape.
const configSchema = z.record(z.string());

export const createConnectorInstanceSchema = z
  .object({
    providerId: providerIdSchema,
    name: z.string().min(1).max(150),
    config: configSchema,
  })
  .superRefine((data, ctx) => {
    const provider = findProvider(data.providerId);
    if (!provider) return; // unreachable given providerIdSchema, but keeps this self-contained
    for (const field of provider.configFields) {
      if (field.required && !data.config[field.key]?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['config', field.key], message: `${field.label} is required` });
      }
    }
  });

// PATCH updates name/config/isActive — providerId is immutable (delete and recreate to switch
// providers, same immutable-identity precedent as apiKeys'/webhookEndpoints' own fixed fields).
// At least one field must be present; config completeness against the provider's required fields
// is re-checked in the service layer, where the existing row's providerId is known.
export const updateConnectorInstanceSchema = z
  .object({
    name: z.string().min(1).max(150).optional(),
    config: configSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => data.name !== undefined || data.config !== undefined || data.isActive !== undefined, {
    message: 'Provide at least one of name, config, or isActive',
  });
