import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiEnvelope } from '@/lib/api';

// Phase 12 (billing/subscriptions). See backend/src/modules/billing/plans.ts (the plan catalog)
// and billing.service.ts (Stripe Checkout/portal + webhook-driven sync). There's no real Stripe
// account in this sandbox — checkout/portal actions 400 with a clear "not configured" message
// until an operator sets STRIPE_SECRET_KEY (see useBillingSummary's billingEnabled flag below).

export type PlanId = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface Plan {
  id: PlanId;
  name: string;
  priceId: string | null;
  monthlyPriceUsd: number | null;
  maxUsers: number | null;
  maxLeads: number | null;
}

export interface BillingSummary {
  subscription: {
    planId: string;
    status: 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE';
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    hasStripeCustomer: boolean;
  };
  plan: Plan;
  usage: {
    users: { used: number; limit: number | null };
    leads: { used: number; limit: number | null };
  };
  billingEnabled: boolean;
}

export interface Invoice {
  id: string;
  stripeInvoiceId: string;
  amountDueCents: number;
  amountPaidCents: number;
  currency: string;
  status: string;
  hostedInvoiceUrl: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
}

export function usePlans() {
  return useQuery({
    queryKey: ['billingPlans'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Plan[]>>('/billing/plans');
      return res.data.data;
    },
    staleTime: Infinity, // a fixed, in-code catalog — never changes within a running deployment
  });
}

export function useBillingSummary() {
  return useQuery({
    queryKey: ['billingSummary'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<BillingSummary>>('/billing/summary');
      return res.data.data;
    },
    staleTime: 10_000,
  });
}

export function useBillingInvoices() {
  return useQuery({
    queryKey: ['billingInvoices'],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<Invoice[]>>('/billing/invoices');
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useCreateCheckoutSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (planId: PlanId) => {
      const res = await api.post<ApiEnvelope<{ url: string }>>('/billing/checkout', { planId });
      return res.data.data;
    },
    // The org's Stripe customer id may have just been created for the first time — refresh the
    // summary so a second checkout attempt (or the portal button) picks it up immediately.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billingSummary'] }),
  });
}

export function useCreatePortalSession() {
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<ApiEnvelope<{ url: string }>>('/billing/portal');
      return res.data.data;
    },
  });
}
