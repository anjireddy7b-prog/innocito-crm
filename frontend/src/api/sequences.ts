import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';
import type { Sequence, SequenceEnrollment } from '@/types';

// Phase 9 ("advanced CRM" slice) — sequences, Stage 2. Mirrors api/cases.ts's query-key shape:
// a broad ['sequences'] key for the list plus per-id keys, all invalidated together on any
// mutation since step/enrollment changes also change what the list's stepCount/
// activeEnrollmentCount show.

export interface SequencesQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  sortDir?: 'asc' | 'desc';
}

export function useSequences(query: SequencesQuery) {
  return useQuery({
    queryKey: ['sequences', query],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Sequence[]>>('/sequences', { params: query });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useSequence(id?: string) {
  return useQuery({
    queryKey: ['sequences', id],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Sequence>>(`/sequences/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

function useInvalidateSequences() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['sequences'] });
}

export function useCreateSequence() {
  const invalidate = useInvalidateSequences();
  return useMutation({
    mutationFn: async (payload: { name: string; description?: string | null }) => {
      const res = await api.post<ApiEnvelope<Sequence>>('/sequences', payload);
      return res.data.data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateSequence(id: string) {
  const invalidate = useInvalidateSequences();
  return useMutation({
    mutationFn: async (payload: { name?: string; description?: string | null; status?: Sequence['status'] }) => {
      const res = await api.patch<ApiEnvelope<Sequence>>(`/sequences/${id}`, payload);
      return res.data.data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteSequence() {
  const invalidate = useInvalidateSequences();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/sequences/${id}`),
    onSuccess: invalidate,
  });
}

export function useCreateStep(sequenceId: string) {
  const invalidate = useInvalidateSequences();
  return useMutation({
    mutationFn: async (payload: { subject: string; body: string; delayDays: number }) => {
      const res = await api.post<ApiEnvelope<Sequence>>(`/sequences/${sequenceId}/steps`, payload);
      return res.data.data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateStep(sequenceId: string, stepId: string) {
  const invalidate = useInvalidateSequences();
  return useMutation({
    mutationFn: async (payload: { subject?: string; body?: string; delayDays?: number }) => {
      const res = await api.patch<ApiEnvelope<Sequence>>(`/sequences/${sequenceId}/steps/${stepId}`, payload);
      return res.data.data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteStep(sequenceId: string) {
  const invalidate = useInvalidateSequences();
  return useMutation({
    mutationFn: async (stepId: string) => {
      const res = await api.delete<ApiEnvelope<Sequence>>(`/sequences/${sequenceId}/steps/${stepId}`);
      return res.data.data;
    },
    onSuccess: invalidate,
  });
}

export function useMoveStep(sequenceId: string) {
  const invalidate = useInvalidateSequences();
  return useMutation({
    mutationFn: async ({ stepId, direction }: { stepId: string; direction: 'up' | 'down' }) => {
      const res = await api.post<ApiEnvelope<Sequence>>(`/sequences/${sequenceId}/steps/${stepId}/move`, { direction });
      return res.data.data;
    },
    onSuccess: invalidate,
  });
}

export function useEnrollments(sequenceId: string, query: { page?: number; pageSize?: number; status?: string }) {
  return useQuery({
    queryKey: ['sequences', sequenceId, 'enrollments', query],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<SequenceEnrollment[]>>(`/sequences/${sequenceId}/enrollments`, { params: query });
      return res.data;
    },
    enabled: !!sequenceId,
    placeholderData: (prev) => prev,
  });
}

export function useEnrollLead(sequenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leadId: string) => {
      const res = await api.post<ApiEnvelope<SequenceEnrollment>>(`/sequences/${sequenceId}/enrollments`, { leadId });
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sequences', sequenceId, 'enrollments'] });
      qc.invalidateQueries({ queryKey: ['sequences'] });
    },
  });
}

function useEnrollmentAction(sequenceId: string, action: 'pause' | 'resume' | 'exit') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enrollmentId: string) => {
      const res = await api.patch<ApiEnvelope<SequenceEnrollment>>(`/sequences/enrollments/${enrollmentId}/${action}`);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sequences', sequenceId, 'enrollments'] });
      qc.invalidateQueries({ queryKey: ['sequences'] });
    },
  });
}

export function usePauseEnrollment(sequenceId: string) {
  return useEnrollmentAction(sequenceId, 'pause');
}

export function useResumeEnrollment(sequenceId: string) {
  return useEnrollmentAction(sequenceId, 'resume');
}

export function useExitEnrollment(sequenceId: string) {
  return useEnrollmentAction(sequenceId, 'exit');
}
