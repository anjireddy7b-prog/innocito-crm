import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';

// Phase 4: tenant-scoped custom field definitions layered on top of leads.customFields (JSONB) —
// see the Architecture Report's Phase 4 completion section. MVP scope only supports LEAD.
export const CUSTOM_FIELD_TYPES = ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTI_SELECT'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export interface CustomFieldDefinition {
  id: string;
  organizationId: string;
  entityType: string;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  options: string[] | null;
  required: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export function useCustomFieldDefinitions(entityType: string = 'LEAD') {
  return useQuery({
    queryKey: ['customFieldDefinitions', entityType],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<CustomFieldDefinition[]>>('/custom-fields', { params: { entityType } });
      return res.data.data;
    },
    staleTime: 60_000,
  });
}

export function useCreateCustomFieldDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      entityType?: string;
      key: string;
      label: string;
      fieldType: CustomFieldType;
      options?: string[] | null;
      required?: boolean;
      sortOrder?: number;
    }) => {
      const res = await api.post<ApiEnvelope<CustomFieldDefinition>>('/custom-fields', payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customFieldDefinitions'] }),
  });
}

export function useUpdateCustomFieldDefinition(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { label?: string; options?: string[] | null; required?: boolean; sortOrder?: number }) => {
      const res = await api.patch<ApiEnvelope<CustomFieldDefinition>>(`/custom-fields/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customFieldDefinitions'] }),
  });
}

export function useDeleteCustomFieldDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/custom-fields/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customFieldDefinitions'] }),
  });
}
