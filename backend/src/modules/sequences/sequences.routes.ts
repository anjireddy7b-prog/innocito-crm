import { Router } from 'express';
import { authenticate, requirePermission } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PERMISSIONS } from '@/utils/permissions';
import {
  createSequenceSchema,
  updateSequenceSchema,
  listSequencesQuerySchema,
  createStepSchema,
  updateStepSchema,
  moveStepSchema,
  enrollLeadSchema,
  listEnrollmentsQuerySchema,
} from './sequences.validation';
import * as controller from './sequences.controller';

export const sequencesRouter = Router();
sequencesRouter.use(authenticate);

// Single permission for the whole module, including viewing — see permissions.ts's
// SEQUENCES_MANAGE comment for why this differs from Cases/Knowledge Base's "anyone can view"
// shape.
sequencesRouter.use(requirePermission(PERMISSIONS.SEQUENCES_MANAGE));

// The two enrollment-action routes live under a literal `/enrollments/...` prefix (not nested
// under `/:id/...`) since pausing/resuming/exiting is scoped to the enrollment alone, not to a
// particular sequence in the URL — same shape as case-comments.routes.ts sitting outside
// cases.routes.ts. Declared first only by convention (matching companies.routes.ts's "specific
// literal path before the parameterized one" precedent) — there's no actual collision risk here
// since these are 3-segment paths and `/:id` is 1 segment.
sequencesRouter.patch('/enrollments/:enrollmentId/pause', controller.pauseEnrollment);
sequencesRouter.patch('/enrollments/:enrollmentId/resume', controller.resumeEnrollment);
sequencesRouter.patch('/enrollments/:enrollmentId/exit', controller.exitEnrollment);

sequencesRouter.get('/', validate(listSequencesQuerySchema, 'query'), controller.list);
sequencesRouter.post('/', validate(createSequenceSchema), controller.create);
sequencesRouter.get('/:id', controller.getById);
sequencesRouter.patch('/:id', validate(updateSequenceSchema), controller.update);
sequencesRouter.delete('/:id', controller.remove);

sequencesRouter.post('/:id/steps', validate(createStepSchema), controller.createStep);
sequencesRouter.patch('/:id/steps/:stepId', validate(updateStepSchema), controller.updateStep);
sequencesRouter.delete('/:id/steps/:stepId', controller.removeStep);
sequencesRouter.post('/:id/steps/:stepId/move', validate(moveStepSchema), controller.moveStep);

sequencesRouter.get('/:id/enrollments', validate(listEnrollmentsQuerySchema, 'query'), controller.listEnrollments);
sequencesRouter.post('/:id/enrollments', validate(enrollLeadSchema), controller.enroll);
