import nodemailer, { Transporter } from 'nodemailer';
import { env, emailEnabled } from '@/config/env';
import { logger } from '@/config/logger';

/**
 * Provider-agnostic outbound email dispatch.
 *
 * No email provider is configured for this app yet (no SMTP credentials, no SendGrid/SES/Resend
 * API key) — `emailEnabled` (env.ts) is false until SMTP_HOST etc. are set. Until then, every call
 * here just logs what *would* have been sent, so nothing silently pretends to deliver mail.
 *
 * The important part: every call site resolves the recipient's email by reading `to` fresh from
 * the caller (which itself always comes from a live DB read of `users.email`, never a value cached
 * at an earlier point in time — see notifier.ts). So the moment real credentials are added here,
 * every notification starts landing at whatever email address is *currently* on the user's record,
 * including one an Admin just changed — no other code needs to change.
 */

let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER && env.SMTP_PASSWORD ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Never throws — a failed or unconfigured email must not break the request that triggered it. */
export async function sendEmail({ to, subject, text, html }: SendEmailParams): Promise<void> {
  if (!emailEnabled) {
    logger.info({ to, subject }, '[emailer] SMTP not configured — email not sent (dry run)');
    return;
  }
  try {
    await getTransporter().sendMail({ from: env.SMTP_FROM, to, subject, text, html: html ?? `<p>${text}</p>` });
  } catch (err) {
    logger.error({ err, to, subject }, '[emailer] Failed to send email');
  }
}
