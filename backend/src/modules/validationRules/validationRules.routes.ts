import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import { createValidationRuleSchema, updateValidationRuleSchema, listValidationRulesQuerySchema } from './validationRules.validation';
import * as controller from './validationRules.controller';

export const validationRulesRouter = Router();

validationRulesRouter.use(authenticate);

// Everything here — including reading the rule list — is gated behind a single
// VALIDATION_RULES_MANAGE permission, ADMIN-only by default. Unlike custom fields (where every
// lead viewer needs the field list to render the lead form), a rule is pure server-side
// enforcement with no client-rendering audience to carve a "view" tier out for — mirrors
// customObjects.routes.ts's own reasoning.
validationRulesRouter.get('/', requirePermission(PERMISSIONS.VALIDATION_RULES_MANAGE), validate(listValidationRulesQuerySchema, 'query'), controller.list);
validationRulesRouter.get('/:id', requirePermission(PERMISSIONS.VALIDATION_RULES_MANAGE), controller.getById);
validationRulesRouter.post('/', requirePermission(PERMISSIONS.VALIDATION_RULES_MANAGE), validate(createValidationRuleSchema), controller.create);
validationRulesRouter.patch('/:id', requirePermission(PERMISSIONS.VALIDATION_RULES_MANAGE), validate(updateValidationRuleSchema), controller.update);
validationRulesRouter.delete('/:id', requirePermission(PERMISSIONS.VALIDATION_RULES_MANAGE), controller.remove);
