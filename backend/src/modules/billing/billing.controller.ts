import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { ApiError } from '@/utils/ApiError';
import * as service from './billing.service';

export const listPlans = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: service.listPlans() });
});

export const getSummary = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getBillingSummary(req) });
});

export const createCheckout = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.createCheckoutSession(req, req.body.planId) });
});

export const createPortal = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.createPortalSession(req) });
});

export const listInvoices = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.listInvoices(req) });
});

// NOT part of billingRouter/asyncHandler's usual authenticated-JSON flow — see app.ts, where this
// is registered directly on `app` at the exact `/api/billing/webhook` path with express.raw(),
// ahead of the global express.json() middleware. Stripe calls this completely unauthenticated
// (no Bearer token, no session); handleStripeWebhook's own signature check is the only guard, so
// this handler is written by hand rather than via asyncHandler/requirePermission.
export async function webhookHandler(req: Request, res: Response) {
  try {
    // express.raw() (see app.ts) makes req.body a Buffer of the exact bytes Stripe signed —
    // anything that touched JSON.parse/re-stringify first would break signature verification.
    await service.handleStripeWebhook(req.body as Buffer, req.headers['stripe-signature'] as string | undefined);
    res.json({ received: true });
  } catch (err) {
    const status = err instanceof ApiError ? err.statusCode : 500;
    res.status(status).json({ success: false, message: err instanceof Error ? err.message : 'Webhook processing failed' });
  }
}
