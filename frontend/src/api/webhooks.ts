import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';

// Phase 11 (API/integrations), slice 2. Unlike apiKeys.ts's CreatedApiKey (secret shown exactly
// once, on create only), `secret` is a normal field present on every WebhookEndpoint — see
// backend/src/db/schema.ts's webhookEndpoints table comment for why that's the deliberately
// correct choice here, not an oversight.

export interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  eventTypes: string[];
  isActive: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  eventType: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  attempts: number;
  nextAttemptAt: string;
  lastAttemptAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: string;
}

export function useWebhookEndpoints() {
  return useQuery({
    queryKey: ['webhookEndpoints'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<WebhookEndpoint[]>>('/webhooks');
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useCreateWebhookEndpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { url: string; eventTypes: string[] }) => {
      const res = await api.post<ApiEnvelope<WebhookEndpoint>>('/webhooks', payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhookEndpoints'] }),
  });
}

export function useToggleWebhookEndpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await api.patch<ApiEnvelope<WebhookEndpoint>>(`/webhooks/${id}`, { isActive });
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhookEndpoints'] }),
  });
}

export function useDeleteWebhookEndpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/webhooks/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhookEndpoints'] }),
  });
}

/** Recent delivery log for one endpoint — fetched on demand (not by useWebhookEndpoints) since
 * most of the time a user is just scanning the endpoint list, not debugging one. */
export function useWebhookDeliveries(endpointId: string | null) {
  return useQuery({
    queryKey: ['webhookDeliveries', endpointId],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<WebhookDelivery[]>>(`/webhooks/${endpointId}/deliveries`);
      return res.data.data;
    },
    enabled: !!endpointId,
  });
}
