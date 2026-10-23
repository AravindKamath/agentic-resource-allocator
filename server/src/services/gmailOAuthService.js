import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';
export const GMAIL_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send'
];
const STATE_TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map();

function requireClientConfiguration() {
  if (!config.gmail.clientId || !config.gmail.clientSecret || !config.gmail.redirectUri || !config.gmail.userEmail) {
    throw new Error('Gmail OAuth requires client ID, client secret, redirect URI, and mailbox email');
  }
}

function configuredCallbackPath() {
  const url = new URL(config.gmail.redirectUri);
  const mountedPrefix = '/api/gmail';
  if (!url.pathname.startsWith(mountedPrefix)) {
    throw new Error(`GMAIL_REDIRECT_URI must use the ${mountedPrefix} route prefix`);
  }
  return url.pathname.slice(mountedPrefix.length) || '/oauth/callback';
}

function rememberState(state) {
  pendingStates.set(state, Date.now() + STATE_TTL_MS);
  for (const [key, expiresAt] of pendingStates) {
    if (expiresAt <= Date.now()) pendingStates.delete(key);
  }
}

function consumeState(state) {
  const expiresAt = pendingStates.get(state);
  pendingStates.delete(state);
  return Boolean(expiresAt && expiresAt > Date.now());
}

export function getGmailOAuthCallbackPath() {
  requireClientConfiguration();
  return configuredCallbackPath();
}

export function createGmailAuthorizationUrl() {
  requireClientConfiguration();
  const state = crypto.randomBytes(32).toString('hex');
  rememberState(state);
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: config.gmail.clientId,
    redirect_uri: config.gmail.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: GMAIL_OAUTH_SCOPES.join(' '),
    state
  });
  return url.toString();
}

async function parseResponse(response, action) {
  const body = await response.text();
  let payload = {};
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const reason = typeof payload.error === 'string' ? payload.error : 'unknown_error';
    const description = typeof payload.error_description === 'string'
      ? payload.error_description.replace(/[\r\n]+/g, ' ').slice(0, 240)
      : '';
    const error = new Error(`Google OAuth ${action} failed (${response.status}): ${reason}${description ? ` - ${description}` : ''}`);
    error.code = reason;
    throw error;
  }
  return payload;
}

export async function exchangeGmailAuthorizationCode(code) {
  requireClientConfiguration();
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.gmail.clientId,
      client_secret: config.gmail.clientSecret,
      redirect_uri: config.gmail.redirectUri,
      grant_type: 'authorization_code'
    })
  });
  const tokens = await parseResponse(response, 'code exchange');
  if (!tokens.access_token) throw new Error('Google OAuth did not return an access token');

  const accountResponse = await fetch(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${tokens.access_token}` }
  });
  const account = await parseResponse(accountResponse, 'account verification');
  const authorizedEmail = account.email?.trim().toLowerCase();
  if (!authorizedEmail || authorizedEmail !== config.gmail.userEmail.trim().toLowerCase()) {
    throw new Error('The authorized Google account does not match GMAIL_USER_EMAIL');
  }

  if (tokens.refresh_token) {
    config.gmail.refreshToken = tokens.refresh_token;
    if (config.gmail.writeRefreshToken && config.env === 'development') {
      await persistRefreshToken(tokens.refresh_token);
    }
  }
  return { authorizedEmail, refreshTokenStored: Boolean(tokens.refresh_token) };
}

export function validateConfiguredRedirectUri(expectedRedirectUri) {
  requireClientConfiguration();
  return config.gmail.redirectUri === expectedRedirectUri;
}

async function persistRefreshToken(refreshToken) {
  const envPath = path.resolve(process.cwd(), '.env');
  let content = '';
  try {
    content = await fs.readFile(envPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const line = `GMAIL_REFRESH_TOKEN=${refreshToken}`;
  const pattern = /^GMAIL_REFRESH_TOKEN=.*$/m;
  const next = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.trimEnd()}\n${line}\n`;
  await fs.writeFile(envPath, next, { mode: 0o600 });
}

export function validateGmailOAuthState(state) {
  return typeof state === 'string' && consumeState(state);
}
