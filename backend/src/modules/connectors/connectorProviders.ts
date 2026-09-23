// Phase 11 (API/integrations), slice 3 — the third-party connector abstraction layer.
//
// This is the whole reason the word "abstraction" belongs in this slice's name: it's the fixed
// catalog of providers a tenant CAN configure a connector instance for, plus each provider's
// config field shape (what to ask for, and which of those fields are secret and therefore
// encrypted at rest — see db/schema.ts's connectorInstances table comment). It is deliberately
// NOT wired up to any of these providers' real APIs. Creating a "Slack" connector instance here
// stores a webhook URL and a label; it does not, this slice, ever POST to Slack. The three
// providers below exist to prove the framework's shape works for meaningfully different config
// needs (a single URL; an API-key-plus-account-id pair; a full OAuth client) — not because any of
// the three is scheduled to go live next. Wiring a specific provider up for real is its own future
// slice, picked deliberately, with that provider's actual API in view — this groundwork is what
// that slice would build on, not a promise about which provider comes first.
export type ConnectorConfigFieldType = 'text' | 'url' | 'secret';

export interface ConnectorConfigField {
  key: string;
  label: string;
  type: ConnectorConfigFieldType;
  required: boolean;
  placeholder?: string;
}

export interface ConnectorProvider {
  id: string;
  name: string;
  category: 'notifications' | 'crm_sync' | 'video';
  description: string;
  configFields: ConnectorConfigField[];
}

export const CONNECTOR_PROVIDERS: ConnectorProvider[] = [
  {
    id: 'slack',
    name: 'Slack',
    category: 'notifications',
    description: 'Post CRM notifications into a Slack channel via an incoming webhook URL.',
    configFields: [
      { key: 'webhookUrl', label: 'Incoming Webhook URL', type: 'secret', required: true, placeholder: 'https://hooks.slack.com/services/…' },
      { key: 'channelLabel', label: 'Channel (for your own reference)', type: 'text', required: false, placeholder: '#sales-alerts' },
    ],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    category: 'crm_sync',
    description: 'Sync leads and contacts with a HubSpot account using a private app access token.',
    configFields: [
      { key: 'accessToken', label: 'Private App Access Token', type: 'secret', required: true, placeholder: 'pat-na1-…' },
      { key: 'portalId', label: 'HubSpot Portal ID', type: 'text', required: false, placeholder: '12345678' },
    ],
  },
  {
    id: 'zoom',
    name: 'Zoom',
    category: 'video',
    description: 'Auto-create Zoom meeting links for scheduled meetings using a Server-to-Server OAuth app.',
    configFields: [
      { key: 'accountId', label: 'Account ID', type: 'text', required: true },
      { key: 'clientId', label: 'Client ID', type: 'text', required: true },
      { key: 'clientSecret', label: 'Client Secret', type: 'secret', required: true },
    ],
  },
];

export function findProvider(providerId: string): ConnectorProvider | undefined {
  return CONNECTOR_PROVIDERS.find((p) => p.id === providerId);
}

export const ALL_PROVIDER_IDS: string[] = CONNECTOR_PROVIDERS.map((p) => p.id);
