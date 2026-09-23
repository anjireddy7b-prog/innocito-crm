import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';

// Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 1 (OAuth
// connection infrastructure only; the sequences engine itself is a later slice built on top of
// this). See backend/src/modules/integrations/integrations.service.ts for the full flow.

export type OAuthProvider = 'GOOGLE' | 'MICROSOFT';

export interface IntegrationsStatus {
  google: { configured: boolean };
  microsoft: { configured: boolean };
  connection: {
    provider: OAuthProvider;
    emailAddress: string;
    connectedAt: string;
    // Phase 9, Stage 3 (calendar sync): false for a connection made before the calendar scope
    // existed — Settings prompts a one-time reconnect (the same "Connect" action, since the OAuth
    // flow always requests full consent) rather than silently never syncing that rep's meetings.
    calendarScopeGranted: boolean;
  } | null;
}

export function useIntegrationsStatus() {
  return useQuery({
    queryKey: ['integrations', 'status'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<IntegrationsStatus>>('/integrations/status');
      return res.data.data;
    },
  });
}

async function getConnectUrl(provider: OAuthProvider): Promise<string> {
  const res = await api.get<ApiEnvelope<{ url: string }>>(`/integrations/${provider.toLowerCase()}/connect-url`);
  return res.data.data.url;
}

/**
 * A full-page navigation, not a fetch — the provider's consent screen (and its redirect back to
 * our own unauthenticated /callback route) can't happen inside an XHR. See connect-url's own
 * comment in integrations.service.ts for why the URL embeds a signed state token instead.
 */
export async function connectProvider(provider: OAuthProvider): Promise<void> {
  const url = await getConnectUrl(provider);
  window.location.href = url;
}

export function useDisconnectIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete('/integrations/connection');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations', 'status'] }),
  });
}

export function useTestSendIntegration() {
  return useMutation({
    mutationFn: async () => {
      await api.post('/integrations/test-send');
    },
  });
}
