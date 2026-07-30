import { useQuery } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { AuditLogEntry } from '@/types';

export function useAuditLogs(query: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ['auditLogs', query],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<AuditLogEntry[]>>('/audit-logs', { params: query });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}
