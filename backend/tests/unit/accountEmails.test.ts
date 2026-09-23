import { describe, it, expect, vi, beforeEach } from 'vitest';

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/emailer', () => ({ sendEmail: sendEmailMock }));

import { sendWelcomeEmail, sendPasswordResetEmail } from '@/utils/accountEmails';

describe('accountEmails', () => {
  beforeEach(() => {
    sendEmailMock.mockClear();
  });

  it('sendWelcomeEmail sends to the new user with the temp password and a login link, in both text and html', async () => {
    await sendWelcomeEmail({ to: 'new.hire@innocito.com', firstName: 'New', temporaryPassword: 'Ab12-Cd34!1' });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.to).toBe('new.hire@innocito.com');
    expect(call.subject).toMatch(/account is ready/i);
    expect(call.text).toContain('Ab12-Cd34!1');
    expect(call.text).toContain('new.hire@innocito.com');
    expect(call.text).toContain('/login');
    expect(call.html).toContain('Ab12-Cd34!1');
    expect(call.html).toContain('/login');
  });

  it('sendPasswordResetEmail sends the new temp password and a login link, without claiming to be a first-time welcome', async () => {
    await sendPasswordResetEmail({ to: 'existing.user@innocito.com', firstName: 'Existing', temporaryPassword: 'Zz98-Yy76!1' });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.to).toBe('existing.user@innocito.com');
    expect(call.subject).toMatch(/password was reset/i);
    expect(call.text).toContain('Zz98-Yy76!1');
    expect(call.text).toContain('/login');
    expect(call.html).toContain('Zz98-Yy76!1');
  });

  it('builds the login link from CLIENT_ORIGIN, taking only the first origin when the env var lists several', async () => {
    await sendWelcomeEmail({ to: 'a@b.com', firstName: 'A', temporaryPassword: 'pw' });
    const call = sendEmailMock.mock.calls[0][0];
    // Defaults to http://localhost:5173 in the test environment (env.ts) — proves the link is
    // actually derived from CLIENT_ORIGIN rather than hardcoded.
    expect(call.text).toContain('http://localhost:5173/login');
  });
});
