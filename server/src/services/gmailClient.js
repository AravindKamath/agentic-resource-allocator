import { config } from '../config.js';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN = 'https://oauth2.googleapis.com/token';

function encoded(value) {
  return Buffer.from(value).toString('base64url');
}

function decode(value = '') {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

async function jsonResponse(response, action) {
  const body = await response.text();
  if (!response.ok) throw new Error(`Gmail ${action} failed (${response.status})`);
  return body ? JSON.parse(body) : {};
}

export function assertGmailConfigured() {
  const required = ['clientId', 'clientSecret', 'refreshToken', 'userEmail'];
  if (!config.gmail.enabled) throw new Error('Gmail integration is disabled');
  if (required.some(key => !config.gmail[key])) throw new Error('Gmail integration is not fully configured');
}

async function accessToken() {
  assertGmailConfigured();
  const response = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.gmail.clientId,
      client_secret: config.gmail.clientSecret,
      refresh_token: config.gmail.refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const data = await jsonResponse(response, 'token refresh');
  if (!data.access_token) throw new Error('Gmail token refresh returned no access token');
  return data.access_token;
}

async function gmailRequest(path, options = {}) {
  const token = await accessToken();
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  return jsonResponse(response, path);
}

export async function listUnreadMessages() {
  const query = encodeURIComponent(`is:unread label:${config.gmail.label}`);
  const data = await gmailRequest(`/messages?q=${query}&maxResults=25`);
  return data.messages || [];
}

export async function getMessage(id) {
  return gmailRequest(`/messages/${encodeURIComponent(id)}?format=full`);
}

export async function markRead(id) {
  return gmailRequest(`/messages/${encodeURIComponent(id)}/modify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
  });
}

export async function sendMessage({ to, subject, body, threadId, inReplyTo }) {
  const safeSubject = subject.replace(/[\r\n]+/g, ' ').trim().slice(0, 998);
  const headers = [
    `To: ${to}`,
    `Subject: ${safeSubject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : [])
  ];
  const raw = encoded(`${headers.join('\r\n')}\r\n\r\n${body}`);
  return gmailRequest('/messages/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) })
  });
}

export function parseMessage(message) {
  const headers = Object.fromEntries((message.payload?.headers || []).map(header => [header.name.toLowerCase(), header.value]));
  const parts = message.payload?.parts || [];
  const allParts = [];
  const collect = part => {
    if (part) allParts.push(part);
    for (const child of part?.parts || []) collect(child);
  };
  for (const part of parts) collect(part);
  const textPart = allParts.find(part => part.mimeType === 'text/plain');
  const htmlPart = allParts.find(part => part.mimeType === 'text/html');
  const data = textPart?.body?.data || htmlPart?.body?.data || message.payload?.body?.data || '';
  const text = decode(data).replace(/<[^>]+>/g, ' ').replace(/\r/g, '').trim();
  return {
    id: message.id,
    threadId: message.threadId,
    sender: headers.from?.match(/<([^>]+)>/)?.[1]?.trim().toLowerCase() || headers.from?.trim().toLowerCase() || '',
    subject: headers.subject || '',
    messageId: headers['message-id'] || '',
    body: text,
    receivedAt: message.internalDate ? new Date(Number(message.internalDate)) : new Date()
  };
}
