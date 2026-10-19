import { Router } from 'express';
import {
  createGmailAuthorizationUrl,
  exchangeGmailAuthorizationCode,
  getGmailOAuthCallbackPath,
  validateGmailOAuthState,
  validateConfiguredRedirectUri
} from '../services/gmailOAuthService.js';
import { logger } from '../logger.js';

export const gmailOAuth = Router();

gmailOAuth.get('/oauth', (req, res) => {
  try {
    res.redirect(createGmailAuthorizationUrl());
  } catch (error) {
    res.status(503).json({ message: error.message });
  }
});

const callbackPath = (() => {
  try {
    return getGmailOAuthCallbackPath();
  } catch {
    return '/oauth/callback';
  }
})();

gmailOAuth.get(callbackPath, async (req, res) => {
  if (!validateGmailOAuthState(req.query.state)) {
    return res.status(400).send('Invalid or expired OAuth state. Start authorization again.');
  }
  if (req.query.error) {
    return res.status(400).send('Google OAuth authorization was not completed.');
  }
  if (typeof req.query.code !== 'string') {
    return res.status(400).send('Google OAuth did not return an authorization code.');
  }
  try {
    if (req.query.redirect_uri && !validateConfiguredRedirectUri(req.query.redirect_uri)) {
      return res.status(400).send('Gmail authorization failed. The redirect URI does not match server configuration.');
    }
    const result = await exchangeGmailAuthorizationCode(req.query.code);
    res.type('html').send(
      `<h1>Gmail authorized</h1><p>Mailbox ${result.authorizedEmail} was verified.</p><p>Refresh-token storage: ${result.refreshTokenStored ? 'updated' : 'existing token preserved'}.</p><p>You may close this window.</p>`
    );
  } catch (error) {
    logger.warn({ code: error.code || 'oauth_callback_failed', reason: error.message }, 'Gmail OAuth callback failed');
    const detail = process.env.NODE_ENV === 'development' && error.code
      ? `<p>Diagnostic: ${error.code}</p>`
      : '';
    res.status(400).send(`Gmail authorization failed. Check the server configuration and try again.${detail}`);
  }
});
