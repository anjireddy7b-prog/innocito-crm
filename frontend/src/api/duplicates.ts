import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';

// Phase 9 ("advanced CRM" slice) — duplicate detection & merge for Companies and Contacts, computed
// at request time (no persisted candidate table), so this query is always fresh. See the backend's
// duplicates.service.ts for the full scope rationale (Leads are deliberately excluded).
export type DuplicateEntityType = 'COMPANY' | 'CONTACT';

export interface DuplicateCompanyRecord {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  country: string | null;
  createdAt: string;
}

export interface DuplicateContactRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  companyId: string | null;
  createdAt: string;
  company?: { id: string; name: string } | null;
}

export interface DuplicateGroup<T> {
  matchedOn: string[];
  records: T[];
}

export function useDuplicateGroups<T = DuplicateCompanyRecord | DuplicateContactRecord>(entityType: DuplicateEntityType) {
  return useQuery({
    queryKey: ['duplicates', entityType],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<DuplicateGroup<T>[]>>('/duplicates', { params: { entityType } });
      return res.data.data;
    },
  });
}

export function useMergeDuplicates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { entityType: DuplicateEntityType; survivorId: string; duplicateId: string }) => {
      const res = await api.post('/duplicates/merge', payload);
      return res.data.data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['duplicates', variables.entityType] });
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}
