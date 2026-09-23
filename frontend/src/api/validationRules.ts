import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';

// Phase 8 ("process engines," synchronous validation-rule slice — see the backend's db/schema.ts
// validationRules table comment for why full async workflow automation/approvals are deferred to
// a later increment). A rule reads as "when <whenField> <whenOperator> [<whenValue>], then
// <thenRequireFields> are required" and is enforced synchronously on lead create/update/status-change.
export const WHEN_OPERATORS = ['equals', 'not_equals', 'is_set', 'is_not_set'] as const;
export type WhenOperator = (typeof WHEN_OPERATORS)[number];

export interface ValidationRule {
  id: string;
  organizationId: string;
  entityType: string;
  name: string;
  description: string | null;
  isActive: boolean;
  whenField: string;
  whenOperator: WhenOperator;
  whenValue: string | null;
  thenRequireFields: string[];
  errorMessage: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationRuleInput {
  name: string;
  description?: string | null;
  isActive?: boolean;
  whenField: string;
  whenOperator: WhenOperator;
  whenValue?: string | null;
  thenRequireFields: string[];
  errorMessage?: string | null;
  sortOrder?: number;
}

// entityType is fixed to 'LEAD' for now (see the backend module's own scoping comment), so it's
// not a caller-supplied parameter yet — mirrors customFieldDefinitions' own LEAD-only-first precedent.
export function useValidationRules() {
  return useQuery({
    queryKey: ['validationRules'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<ValidationRule[]>>('/validation-rules', { params: { entityType: 'LEAD' } });
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useCreateValidationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ValidationRuleInput) => {
      const res = await api.post<ApiEnvelope<ValidationRule>>('/validation-rules', { entityType: 'LEAD', ...payload });
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['validationRules'] }),
  });
}

export function useUpdateValidationRule(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ValidationRuleInput>) => {
      const res = await api.patch<ApiEnvelope<ValidationRule>>(`/validation-rules/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['validationRules'] }),
  });
}

export function useDeleteValidationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/validation-rules/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['validationRules'] }),
  });
}
