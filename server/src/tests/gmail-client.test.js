import { jest } from '@jest/globals';
import { config } from '../config.js';
import { extractGoogleErrorDetails, getGmailProfile, parseMessage } from '../services/gmailClient.js';

describe('Gmail message parsing', () => {
  test('uses the trusted sender header and readable plain text part', () => {
    const parsed = parseMessage({
      id: 'message-1',
      threadId: 'thread-1',
      internalDate: '1720000000000',
      payload: {
        headers: [
          { name: 'From', value: 'Requester <user@example.com>' },
          { name: 'Subject', value: 'Need a workstation' }
        ],
        parts: [{
          mimeType: 'multipart/alternative',
          parts: [{ mimeType: 'text/plain', body: { data: Buffer.from('Need 64 GB RAM').toString('base64url') } }]
        }]
      }
    });

    expect(parsed.sender).toBe('user@example.com');
    expect(parsed.subject).toBe('Need a workstation');
    expect(parsed.body).toBe('Need 64 GB RAM');
    expect(parsed.threadId).toBe('thread-1');
  });
});

describe('Gmail connectivity diagnostic', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    config.gmail.enabled = false;
    config.gmail.clientId = 'client-id';
    config.gmail.clientSecret = 'client-secret';
    config.gmail.refreshToken = 'refresh-token';
    config.gmail.userEmail = 'mailbox@example.com';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('refreshes authentication and reads the Gmail profile while polling is disabled', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-token' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ emailAddress: 'mailbox@example.com' })
      });

    await expect(getGmailProfile()).resolves.toEqual({ emailAddress: 'mailbox@example.com' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toBe('https://gmail.googleapis.com/gmail/v1/users/me/profile');
  });

  test('reports an invalid refresh token without exposing credentials', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'invalid_grant' })
    });

    await expect(getGmailProfile()).rejects.toMatchObject({
      code: 'invalid_grant',
      status: 401,
      stage: 'token_refresh'
    });
  });

  test('reports a sanitized Gmail API provider code and status', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-token' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({
          error: {
            code: 403,
            message: 'Gmail API has not been used in project before or it is disabled',
            status: 'PERMISSION_DENIED',
            errors: [{
              reason: 'accessNotConfigured',
              domain: 'usageLimits'
            }]
          }
        })
      });

    await expect(getGmailProfile()).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      status: 403,
      stage: 'gmail_api_request',
      google: {
        message: expect.any(String),
        reason: 'accessNotConfigured',
        domain: expect.any(String),
        status: 'PERMISSION_DENIED'
      }
    });
  });

  test('handles incomplete Google error details safely', async () => {
    expect(extractGoogleErrorDetails({ error: {} }, 403)).toEqual({
      code: 'http_403',
      httpStatus: 403
    });
  });

  test('rejects missing configuration before making a network request', async () => {
    config.gmail.refreshToken = '';
    global.fetch = jest.fn();

    await expect(getGmailProfile()).rejects.toThrow('not fully configured');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns a profile that can be compared with the configured mailbox', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-token' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ emailAddress: 'other@example.com' })
      });

    const profile = await getGmailProfile();
    expect(profile.emailAddress).not.toBe(config.gmail.userEmail);
  });
});
