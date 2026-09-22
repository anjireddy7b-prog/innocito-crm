import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';

// Phase 5: tenant-defined custom objects — entities with their own schema-lite definition that
// reuse the exact custom-field-definition engine from Phase 4 (see the Architecture Report's
// Phase 5 completion section and backend/src/modules/customObjects/customObjects.service.ts).
export interface CustomObjectDefinition {
  id: string;
  organizationId: string;
  key: string;
  singularLabel: string;
  pluralLabel: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

// A record has no typed columns of its own — `data` IS the entire record, validated against the
// object's own field definitions (custom-fields with entityType = this object's key).
export interface CustomObjectRecord {
  id: string;
  organizationId: string;
  objectDefinitionId: string;
  data: Record<string, unknown>;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useCustomObjectDefinitions() {
  return useQuery({
    queryKey: ['customObjectDefinitions'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<CustomObjectDefinition[]>>('/custom-objects');
      return res.data.data;
    },
    staleTime: 60_000,
  });
}

export function useCustomObjectDefinition(id?: string) {
  return useQuery({
    queryKey: ['customObjectDefinitions', id],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<CustomObjectDefinition>>(`/custom-objects/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateCustomObjectDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { key: string; singularLabel: string; pluralLabel: string; description?: string | null }) => {
      const res = await api.post<ApiEnvelope<CustomObjectDefinition>>('/custom-objects', payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customObjectDefinitions'] }),
  });
}

export function useUpdateCustomObjectDefinition(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { singularLabel?: string; pluralLabel?: string; description?: string | null }) => {
      const res = await api.patch<ApiEnvelope<CustomObjectDefinition>>(`/custom-objects/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customObjectDefinitions'] }),
  });
}

export function useDeleteCustomObjectDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/custom-objects/${id}`);
    },
    // Deleting a definition also cleans up its field definitions server-side (no FK there — see
    // customObjects.service.ts) so the custom-fields cache for that entityType is now stale too.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customObjectDefinitions'] });
      queryClient.invalidateQueries({ queryKey: ['customFieldDefinitions'] });
    },
  });
}

export interface CustomObjectRecordsQuery {
  page?: number;
  pageSize?: number;
}

export function useCustomObjectRecords(definitionId: string | undefined, query: CustomObjectRecordsQuery = {}) {
  return useQuery({
    queryKey: ['customObjectRecords', definitionId, query],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<CustomObjectRecord[]>>(`/custom-objects/${definitionId}/records`, { params: query });
      return res.data;
    },
    enabled: !!definitionId,
    placeholderData: (prev) => prev,
  });
}

export function useCustomObjectRecord(definitionId: string | undefined, recordId: string | undefined) {
  return useQuery({
    queryKey: ['customObjectRecords', definitionId, recordId],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<CustomObjectRecord>>(`/custom-objects/${definitionId}/records/${recordId}`);
      return res.data.data;
    },
    enabled: !!definitionId && !!recordId,
  });
}

export function useCreateCustomObjectRecord(definitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { data?: Record<string, unknown> }) => {
      const res = await api.post<ApiEnvelope<CustomObjectRecord>>(`/custom-objects/${definitionId}/records`, payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customObjectRecords', definitionId] }),
  });
}

export function useUpdateCustomObjectRecord(definitionId: string, recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { data?: Record<string, unknown> }) => {
      const res = await api.patch<ApiEnvelope<CustomObjectRecord>>(`/custom-objects/${definitionId}/records/${recordId}`, payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customObjectRecords', definitionId] }),
  });
}

export function useDeleteCustomObjectRecord(definitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recordId: string) => {
      await api.delete(`/custom-objects/${definitionId}/records/${recordId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customObjectRecords', definitionId] }),
  });
}
