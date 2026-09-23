import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { recordAudit } from '@/utils/auditLogger';
import { sendEmailAsUser } from '@/utils/emailSender';
import * as service from './integrations.service';
import type { OAuthProvider } from './integrations.service';

export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.getConnectionStatus(req.user!.sub) });
});

export const getGoogleConnectUrl = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: { url: service.getConnectUrl(req.user!.sub, 'GOOGLE') } });
});

export const getMicrosoftConnectUrl = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: { url: service.getConnectUrl(req.user!.sub, 'MICROSOFT') } });
});

/**
 * Callback handlers are deliberately NOT wrapped in asyncHandler's normal JSON-error path — this
 * is a top-level browser navigation initiated by Google/Microsoft, not a fetch call our frontend
 * can read a JSON error body from. Every outcome, success or failure, ends in a redirect back to
 * the SPA's Settings page so the user sees a normal page rather than a raw JSON error response.
 */
function callbackHandler(provider: OAuthProvider) {
  return async (req: Request, res: Response) => {
    const { code, state, error: providerError } = req.query as { code?: string; state?: string; error?: string };
    const redirectBase = `${env.CLIENT_ORIGIN.split(',')[0].trim()}/settings`;

    if (providerError) {
      // Temporary diagnostic logging (Stage 3 rollout) — the provider redirected back with an
      // error before we ever got a code/state to work with; log what it said so this is
      // debuggable from Railway logs instead of a silent "connected=error" redirect.
      logger.warn(
        { provider, error: providerError, description: (req.query as { error_description?: string }).error_description },
        '[integrations] OAuth provider returned an error before code exchange'
      );
      return res.redirect(`${redirectBase}?connected=error&provider=${provider.toLowerCase()}`);
    }
    if (!code || !state) {
      logger.warn({ provider, hasCode: !!code, hasState: !!state }, '[integrations] OAuth callback missing code or state');
      return res.redirect(`${redirectBase}?connected=error&provider=${provider.toLowerCase()}`);
    }

    try {
      const { userId, email } = await service.completeOAuthCallback(provider, code, state);
      await recordAudit({
        req,
        action: 'CREATE',
        entityType: 'EmailConnection',
        entityId: userId,
        newValues: { provider, emailAddress: email },
      });
      return res.redirect(`${redirectBase}?connected=${provider.toLowerCase()}`);
    } catch (err) {
      logger.error({ err, provider }, '[integrations] OAuth callback failed');
      return res.redirect(`${redirectBase}?connected=error&provider=${provider.toLowerCase()}`);
    }
  };
}

export const googleCallback = callbackHandler('GOOGLE');
export const microsoftCallback = callbackHandler('MICROSOFT');

export const disconnect = asyncHandler(async (req: Request, res: Response) => {
  await service.disconnect(req.user!.sub);
  await recordAudit({ req, action: 'DELETE', entityType: 'EmailConnection', entityId: req.user!.sub });
  res.status(204).send();
});

export const testSend = asyncHandler(async (req: Request, res: Response) => {
  await sendEmailAsUser(req.user!.sub, {
    to: req.user!.email,
    subject: 'SDR ReachOut — test email',
    text: 'This is a test email from your connected mailbox in SDR ReachOut. If you received this, your connection is working.',
  });
  res.json({ success: true, data: { sent: true } });
});
