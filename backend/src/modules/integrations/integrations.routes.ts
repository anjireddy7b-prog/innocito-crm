import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import * as controller from './integrations.controller';

export const integrationsRouter = Router();

// Connecting/disconnecting one's own mailbox is a personal, self-service action — no dedicated
// permission is required, same precedent as acting on one's own comments/documents elsewhere in
// this codebase (see comments.routes.ts). Every route below is scoped to req.user!.sub — a caller
// can only ever read or change their OWN connection, never another user's.
integrationsRouter.get('/status', authenticate, controller.getStatus);
integrationsRouter.get('/google/connect-url', authenticate, controller.getGoogleConnectUrl);
integrationsRouter.get('/microsoft/connect-url', authenticate, controller.getMicrosoftConnectUrl);
integrationsRouter.delete('/connection', authenticate, controller.disconnect);
integrationsRouter.post('/test-send', authenticate, controller.testSend);

// These two are the exception: Google/Microsoft redirect the USER'S BROWSER here directly after
// consent, with no Authorization header at all (it's a top-level navigation, not our SPA's
// fetch client) — identity instead comes from the signed `state` param verified inside
// completeOAuthCallback (see integrations.service.ts's module comment for why).
integrationsRouter.get('/google/callback', controller.googleCallback);
integrationsRouter.get('/microsoft/callback', controller.microsoftCallback);
