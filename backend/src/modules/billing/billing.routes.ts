import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { createCheckoutSessionSchema } from './billing.validation';
import * as controller from './billing.controller';

export const billingRouter = Router();

billingRouter.use(authenticate);

// Phase 12 (billing/subscriptions). Same "every route manages the thing itself, no separate view
// tier" reasoning as apiKeys/webhooks/connectors — a plan change or an open billing-portal link
// is exactly as sensitive as the invoice history it shares a permission with, so all of it sits
// behind BILLING_MANAGE (ADMIN-only by default — see utils/permissions.ts). The plan catalog
// itself is static, global reference data with no secrets, but like connectors' provider catalog
// it's only useful alongside the upgrade UI it powers.
//
// NOTE: the Stripe webhook route is deliberately NOT here — see app.ts, where it's registered
// directly on `app` ahead of the global express.json() middleware, unauthenticated (Stripe itself
// can't carry a Bearer token), and verified instead via billing.service.ts's signature check.
billingRouter.get('/plans', requirePermission(PERMISSIONS.BILLING_MANAGE), controller.listPlans);
billingRouter.get('/summary', requirePermission(PERMISSIONS.BILLING_MANAGE), controller.getSummary);
billingRouter.post('/checkout', requirePermission(PERMISSIONS.BILLING_MANAGE), validate(createCheckoutSessionSchema), controller.createCheckout);
billingRouter.post('/portal', requirePermission(PERMISSIONS.BILLING_MANAGE), controller.createPortal);
billingRouter.get('/invoices', requirePermission(PERMISSIONS.BILLING_MANAGE), controller.listInvoices);
