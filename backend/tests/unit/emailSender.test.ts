import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 9 ("advanced CRM" slice) — sequences/email-calendar integration, Stage 1. This is a true
// unit test (no DB): integrations.service's getValidAccessToken and emailer's sendEmail are both
// mocked so the only thing under test is emailSender.ts's own branching logic — real DB-backed
// coverage of getValidAccessToken/sendViaProvider belongs to integrations.test.ts, and real Google/
// Microsoft delivery can't be tested from this sandbox at all (no legitimate outbound calls to
// those providers from CI — the same limitation documented for emailer.ts's real SMTP delivery).

const { sendEmailMock, getValidAccessTokenMock, sendViaProviderMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn().mockResolvedValue(undefined),
  getValidAccessTokenMock: vi.fn(),
  sendViaProviderMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/emailer', () => ({ sendEmail: sendEmailMock }));
vi.mock('@/modules/integrations/integrations.service', () => ({
  getValidAccessToken: getValidAccessTokenMock,
  sendViaProvider: sendViaProviderMock,
}));

import { sendEmailAsUser } from '@/utils/emailSender';

describe('emailSender.sendEmailAsUser', () => {
  beforeEach(() => {
    sendEmailMock.mockClear();
    getValidAccessTokenMock.mockReset();
    sendViaProviderMock.mockClear();
  });

  it('falls back to SMTP (emailer.sendEmail) when the user has no connection', async () => {
    getValidAccessTokenMock.mockResolvedValue(null);
    const params = { to: 'someone@example.com', subject: 'Hi', text: 'Hello there' };

    await sendEmailAsUser('user-1', params);

    expect(sendEmailMock).toHaveBeenCalledWith(params);
    expect(sendViaProviderMock).not.toHaveBeenCalled();
  });

  it('sends via the connected provider instead of SMTP when a connection exists', async () => {
    getValidAccessTokenMock.mockResolvedValue({ provider: 'GOOGLE', email: 'rep@gmail.com', accessToken: 'tok123' });
    const params = { to: 'someone@example.com', subject: 'Hi', text: 'Hello there' };

    await sendEmailAsUser('user-1', params);

    expect(sendViaProviderMock).toHaveBeenCalledWith('GOOGLE', 'tok123', params);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('propagates a send failure on an existing connection rather than silently falling back to SMTP', async () => {
    getValidAccessTokenMock.mockResolvedValue({ provider: 'MICROSOFT', email: 'rep@outlook.com', accessToken: 'tok456' });
    sendViaProviderMock.mockRejectedValue(new Error('Graph sendMail failed'));
    const params = { to: 'someone@example.com', subject: 'Hi', text: 'Hello there' };

    await expect(sendEmailAsUser('user-1', params)).rejects.toThrow('Graph sendMail failed');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
