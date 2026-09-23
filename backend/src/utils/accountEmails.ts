import { env } from '@/config/env';
import { sendEmail } from '@/utils/emailer';

function loginUrl(): string {
  return `${env.CLIENT_ORIGIN.split(',')[0].trim()}/login`;
}

interface CredentialsEmailInput {
  to: string;
  firstName: string;
  temporaryPassword: string;
}

/**
 * Account welcome/reset emails — a thin templated layer over the shared SMTP dispatch in
 * utils/emailer.ts (same "never throws" contract as every other call site there: a failed or
 * unconfigured send must never break the request that triggered it, so users.service.ts can just
 * await these directly with no try/catch of its own).
 *
 * Both emails carry the temporary password in the clear rather than a one-time reset token/link.
 * That's a deliberate scope decision, not an oversight: this app already hands the same temporary
 * password back to the Admin who triggered the action (createUser/resetPassword's response, shown
 * in a toast — see UserFormDialog.tsx / UsersPage.tsx) as the only way it's ever been communicated
 * to a new hire. Emailing it too adds a delivery channel without inventing new infrastructure — the
 * recipient logs in with it directly and is forced through the existing mustChangePassword flow
 * (auth.service.ts's changePassword clears the flag; authStore.ts / the frontend's password-change
 * gate enforces it before anything else is usable) on their very first login. A separate one-time
 * magic-link token system (its own DB table, expiry, unauthenticated endpoint, frontend page) would
 * be a materially bigger feature than "send the temporary password by email" and isn't what this
 * one connects.
 */
export async function sendWelcomeEmail({ to, firstName, temporaryPassword }: CredentialsEmailInput): Promise<void> {
  const url = loginUrl();
  await sendEmail({
    to,
    subject: 'Your SDR ReachOut account is ready',
    text: `Hi ${firstName},

An account has been created for you on SDR ReachOut CRM.

Login email: ${to}
Temporary password: ${temporaryPassword}

Log in here: ${url}

You'll be asked to set your own password the first time you log in.`,
    html: `
      <p>Hi ${firstName},</p>
      <p>An account has been created for you on <strong>SDR ReachOut CRM</strong>.</p>
      <p><strong>Login email:</strong> ${to}<br/><strong>Temporary password:</strong> ${temporaryPassword}</p>
      <p><a href="${url}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#ffffff;border-radius:6px;text-decoration:none;">Log in to SDR ReachOut</a></p>
      <p style="color:#666;font-size:13px;">You'll be asked to set your own password the first time you log in.</p>
    `.trim(),
  });
}

export async function sendPasswordResetEmail({ to, firstName, temporaryPassword }: CredentialsEmailInput): Promise<void> {
  const url = loginUrl();
  await sendEmail({
    to,
    subject: 'Your SDR ReachOut password was reset',
    text: `Hi ${firstName},

An Admin reset your password on SDR ReachOut CRM.

Temporary password: ${temporaryPassword}

Log in here: ${url}

You'll be asked to set your own password the first time you log in.`,
    html: `
      <p>Hi ${firstName},</p>
      <p>An Admin reset your password on <strong>SDR ReachOut CRM</strong>.</p>
      <p><strong>Temporary password:</strong> ${temporaryPassword}</p>
      <p><a href="${url}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#ffffff;border-radius:6px;text-decoration:none;">Log in to SDR ReachOut</a></p>
      <p style="color:#666;font-size:13px;">You'll be asked to set your own password the first time you log in.</p>
    `.trim(),
  });
}
