import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';

// Phase 14 (AI). All three endpoints require AI_FEATURES_USE server-side (see
// backend/src/modules/ai/ai.routes.ts) — every call site here is already gated behind a UI
// affordance (a button on LeadDetailPage/SequenceStepFormDialog, or the chat panel) that itself
// only renders for a caller holding that permission, so there's no separate client-side guard
// duplicated here.

export interface LeadAiInsights {
  aiSummary: string;
  aiNextStep: string;
  aiScore: number;
  aiInsightsGeneratedAt: string;
}

export function useGenerateLeadInsights(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<ApiEnvelope<LeadAiInsights>>(`/ai/leads/${leadId}/insights`);
      return res.data.data;
    },
    onSuccess: () => {
      // The insights live on the lead row itself (see db/schema.ts's leads.aiSummary etc.) — a
      // refetch of the lead is enough to pick them up, no separate cache entry needed.
      qc.invalidateQueries({ queryKey: ['leads', leadId] });
    },
  });
}

export interface EmailDraft {
  subject: string;
  body: string;
}

export function useDraftEmail() {
  return useMutation({
    mutationFn: async (payload: { instructions: string; sequenceName?: string; stepNumber?: number }) => {
      const res = await api.post<ApiEnvelope<EmailDraft>>('/ai/draft-email', payload);
      return res.data.data;
    },
  });
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function useAiChat() {
  return useMutation({
    mutationFn: async (messages: AiChatMessage[]) => {
      const res = await api.post<ApiEnvelope<{ reply: string }>>('/ai/chat', { messages });
      return res.data.data;
    },
  });
}
