import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { Lead } from '@/types';

export interface LeadsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  source?: string;
  priority?: string;
  campaignId?: string;
  assignedToId?: string;
  currentOwnerId?: string;
  companyId?: string;
  country?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export function useLeads(query: LeadsQuery) {
  return useQuery({
    queryKey: ['leads', query],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Lead[]>>('/leads', { params: query });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useLead(id?: string) {
  return useQuery({
    queryKey: ['leads', id],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Lead>>(`/leads/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.post<ApiEnvelope<Lead>>('/leads', payload);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateLead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.patch<ApiEnvelope<Lead>>(`/leads/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useAssignLead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { assignedToId?: string | null; currentOwnerId?: string | null; note?: string }) => {
      const res = await api.patch<ApiEnvelope<Lead>>(`/leads/${id}/assign`, payload);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useChangeLeadStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { status: string; lossReason?: string | null; note?: string }) => {
      const res = await api.patch<ApiEnvelope<Lead>>(`/leads/${id}/status`, payload);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/leads/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useBulkAssignLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { leadIds: string[]; assignedToId?: string | null; currentOwnerId?: string | null }) => {
      const res = await api.post<ApiEnvelope<{ updated: number }>>('/leads/bulk-assign', payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export interface LeadImportResult {
  totalDataRows: number;
  created: number;
  skippedDuplicates: number;
  skippedInvalidRows: number;
  errors: { row: number; message: string }[];
}

export function useImportLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post<ApiEnvelope<LeadImportResult>>('/leads/import', formData);
      return res.data.data;
    },
    onSuccess: () => {
      // An import can create/update leads, companies, contacts, campaigns,
      // and meetings all at once, and it changes dashboard KPIs — so every
      // page that reads any of that needs to refetch, not just the Leads list.
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['meetings'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['auditLogs'] });
    },
  });
}
