import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';

// Phase 11 (API/integrations), slice 3 — the third-party connector abstraction layer. See
// backend/src/modules/connectors/connectorProviders.ts: this is groundwork (a registry + storage
// pattern), not a live integration with any of these providers yet.

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

export interface ConnectorInstance {
  id: string;
  providerId: string;
  name: string;
  /** Non-secret fields hold their real value; secret fields hold a fixed masked placeholder — see
   * backend/src/modules/connectors/connectors.service.ts's maskConfig. Never the real secret. */
  config: Record<string, string>;
  isActive: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useConnectorProviders() {
  return useQuery({
    queryKey: ['connectorProviders'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<ConnectorProvider[]>>('/connectors/providers');
      return res.data.data;
    },
    staleTime: Infinity, // a fixed, in-code catalog — never changes within a running deployment
  });
}

export function useConnectorInstances() {
  return useQuery({
    queryKey: ['connectorInstances'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<ConnectorInstance[]>>('/connectors');
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useCreateConnectorInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { providerId: string; name: string; config: Record<string, string> }) => {
      const res = await api.post<ApiEnvelope<ConnectorInstance>>('/connectors', payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connectorInstances'] }),
  });
}

export function useUpdateConnectorInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; config?: Record<string, string>; isActive?: boolean }) => {
      const res = await api.patch<ApiEnvelope<ConnectorInstance>>(`/connectors/${id}`, updates);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connectorInstances'] }),
  });
}

export function useDeleteConnectorInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/connectors/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connectorInstances'] }),
  });
}
