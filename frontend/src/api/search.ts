import { useQuery } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';

export interface GlobalSearchResult {
  leads: { id: string; displayId: string; title: string; status: string }[];
  companies: { id: string; name: string; domain: string | null; country: string | null }[];
  contacts: { id: string; firstName: string; lastName: string; email: string | null; company?: { name: string } | null }[];
  campaigns: { id: string; name: string; code: string | null }[];
  salesReps: { id: string; firstName: string; lastName: string; email: string }[];
  // Phase 9 ("advanced CRM" slice) — search hardening. Added after Cases/Knowledge Base themselves
  // shipped without global search coverage (see those modules' own Architecture Report sections).
  cases: { id: string; displayId: string; subject: string; status: string }[];
  knowledgeArticles: { id: string; title: string; category: string | null; status: string }[];
}

export function useGlobalSearch(q: string) {
  return useQuery({
    queryKey: ['search', q],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<GlobalSearchResult>>('/search', { params: { q } });
      return res.data.data;
    },
    enabled: q.trim().length >= 2,
  });
}
