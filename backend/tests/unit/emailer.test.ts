import { describe, it, expect } from 'vitest';
import { emailEnabled } from '@/config/env';
import { sendEmail } from '@/utils/emailer';

describe('emailer', () => {
  it('reports email delivery as disabled when no SMTP_HOST is configured (the default in this environment)', () => {
    expect(emailEnabled).toBe(false);
  });

  it('sendEmail never throws, even with no provider configured — a notification failing to email must not break the request that triggered it', async () => {
    await expect(sendEmail({ to: 'someone@example.com', subject: 'Test', text: 'Hello' })).resolves.toBeUndefined();
  });
});
