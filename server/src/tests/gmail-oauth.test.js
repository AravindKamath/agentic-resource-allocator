import { jest } from '@jest/globals';
import supertest from 'supertest';
import { config } from '../config.js';
import { app } from './setup.js';
import { GMAIL_OAUTH_SCOPES, createGmailAuthorizationUrl, exchangeGmailAuthorizationCode, validateConfiguredRedirectUri, validateGmailOAuthState } from '../services/gmailOAuthService.js';

describe('Gmail OAuth', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    config.gmail.clientId = 'client-id';
    config.gmail.clientSecret = 'client-secret';
    config.gmail.redirectUri = 'http://localhost:8080/api/gmail/oauth/callback';
    config.gmail.userEmail = 'mailbox@example.com';
    config.gmail.refreshToken = 'existing-refresh-token';
    config.gmail.writeRefreshToken = false;
    config.env = 'test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('creates a stateful offline authorization URL with minimum scopes', () => {
    const url = new URL(createGmailAuthorizationUrl());
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('redirect_uri')).toBe(config.gmail.redirectUri);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('scope').split(' ')).toEqual(GMAIL_OAUTH_SCOPES);
    expect(validateGmailOAuthState(url.searchParams.get('state'))).toBe(true);
    expect(validateGmailOAuthState(url.searchParams.get('state'))).toBe(false);
  });

  test('exposes the authorization endpoint without exposing credentials', async () => {
    const response = await supertest(app).get('/api/gmail/oauth').redirects(0);
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(response.headers.location).not.toContain(config.gmail.clientSecret);
  });

  test('verifies the configured mailbox and preserves an absent refresh token', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ access_token: 'access-token' }) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ email: 'mailbox@example.com' }) });

    const result = await exchangeGmailAuthorizationCode('authorization-code');

    expect(result).toEqual({ authorizedEmail: 'mailbox@example.com', refreshTokenStored: false });
    expect(config.gmail.refreshToken).toBe('existing-refresh-token');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][1].body.toString()).toContain('grant_type=authorization_code');
  });

  test('captures a refresh token from a successful exchange', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ access_token: 'access-token', refresh_token: 'new-refresh-token' }) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ email: 'mailbox@example.com' }) });

    const result = await exchangeGmailAuthorizationCode('authorization-code');

    expect(result).toEqual({ authorizedEmail: 'mailbox@example.com', refreshTokenStored: true });
    expect(config.gmail.refreshToken).toBe('new-refresh-token');
  });

  test('detects a redirect URI mismatch before token exchange', () => {
    expect(validateConfiguredRedirectUri('http://localhost:8080/api/gmail/oauth/callback')).toBe(true);
    expect(validateConfiguredRedirectUri('http://127.0.0.1:8080/api/gmail/oauth/callback')).toBe(false);
  });

  test('rejects an authorized account that is not the configured mailbox', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ access_token: 'access-token' }) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ email: 'other@example.com' }) });

    await expect(exchangeGmailAuthorizationCode('authorization-code')).rejects.toThrow('does not match GMAIL_USER_EMAIL');
    expect(config.gmail.refreshToken).toBe('existing-refresh-token');
  });

  test('retains a safe Google error code for failed exchanges', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'invalid_grant', error_description: 'Bad Request' })
    });

    await expect(exchangeGmailAuthorizationCode('authorization-code')).rejects.toMatchObject({ code: 'invalid_grant' });
  });
});
