import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { draftEmailSchema, chatSchema } from './ai.validation';
import * as controller from './ai.controller';

export const aiRouter = Router();

aiRouter.use(authenticate);
// Phase 14 (AI). AI_FEATURES_USE gates every route in this module — see its own comment in
// utils/permissions.ts for why this is a broad, non-admin-gated permission. Individual routes
// below additionally require whatever permission already governs the underlying data, so
// AI_FEATURES_USE alone never grants access to anything the caller couldn't already see or do.
aiRouter.use(requirePermission(PERMISSIONS.AI_FEATURES_USE));

// Capabilities (a) + (b): lead summary/next-step/score, generated together in one call. Gated
// additionally on LEADS_VIEW — same data-access tier as GET /leads/:id itself.
aiRouter.post('/leads/:id/insights', requirePermission(PERMISSIONS.LEADS_VIEW), controller.generateInsights);

// Capability (c): drafts subject/body for a sequence step. Gated additionally on
// SEQUENCES_MANAGE, matching the permission that already gates the whole sequences module this
// button lives inside (see App.tsx's /sequences route and SequenceStepFormDialog.tsx).
aiRouter.post('/draft-email', requirePermission(PERMISSIONS.SEQUENCES_MANAGE), validate(draftEmailSchema), controller.draftEmail);

// Capability (d): the conversational assistant. No extra permission beyond AI_FEATURES_USE
// itself — its tools (ai.tools.ts) are read-only and org-scoped, equivalent in reach to the
// dashboard any authenticated member can already see.
aiRouter.post('/chat', validate(chatSchema), controller.chat);
