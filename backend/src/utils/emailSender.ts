import { logger } from '@/config/logger';
import { sendEmail } from '@/utils/emailer';
import { getValidAccessToken, sendViaProvider } from '@/modules/integrations/integrations.service';

/**
 * Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 1. The send
 * abstraction Stage 2 (the sequences engine, built later) will call instead of utils/emailer.ts
 * directly, so a sequence step's email goes out as the enrolled-owner's own connected mailbox when
 * one exists, and only otherwise falls back to the shared SMTP address emailer.ts already sends
 * through — the same "SMTP is the always-on fallback" behavior integrations.service.ts documents.
 *
 * A send failure on an EXISTING connection propagates as a thrown error rather than silently
 * rerouting through SMTP — sending a sequence email from a different address than the one the
 * recipient expects (because the rep's real connection is temporarily broken) is a worse outcome
 * than the send simply failing and being retried/surfaced.
 */
interface SendAsUserParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmailAsUser(userId: string, params: SendAsUserParams): Promise<void> {
  const connection = await getValidAccessToken(userId);

  if (!connection) {
    await sendEmail(params);
    return;
  }

  try {
    await sendViaProvider(connection.provider, connection.accessToken, params);
  } catch (err) {
    logger.error({ err, userId, provider: connection.provider }, '[emailSender] Send via connected provider failed');
    throw err;
  }
}
