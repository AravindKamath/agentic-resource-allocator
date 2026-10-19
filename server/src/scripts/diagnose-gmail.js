import { config } from '../config.js';
import { getGmailProfile } from '../services/gmailClient.js';

function configurationStatus() {
  return {
    clientId: Boolean(config.gmail.clientId),
    clientSecret: Boolean(config.gmail.clientSecret),
    refreshToken: Boolean(config.gmail.refreshToken),
    userEmail: Boolean(config.gmail.userEmail),
    enabled: config.gmail.enabled
  };
}

function reportError(error) {
  return {
    success: false,
    stage: error.stage || 'configuration',
    code: error.code || 'gmail_diagnostic_failed',
    ...(Number.isInteger(error.status) ? { status: error.status } : {}),
    ...(error.google ? {
      google: {
        ...(error.google.message ? { message: error.google.message } : {}),
        ...(error.google.reason ? { reason: error.google.reason } : {}),
        ...(error.google.domain ? { domain: error.google.domain } : {}),
        ...(error.google.status ? { status: error.google.status } : {})
      }
    } : {})
  };
}

try {
  const configuration = configurationStatus();
  const required = ['clientId', 'clientSecret', 'refreshToken', 'userEmail'];
  const missing = required.filter(key => !configuration[key]);
  if (missing.length > 0) {
    console.log(JSON.stringify({
      success: false,
      stage: 'configuration',
      code: 'gmail_configuration_missing',
      missing,
      enabled: configuration.enabled
    }, null, 2));
    process.exitCode = 1;
  } else {
    const profile = await getGmailProfile();
    const email = typeof profile.emailAddress === 'string' ? profile.emailAddress.trim().toLowerCase() : '';
    const configuredEmail = config.gmail.userEmail.trim().toLowerCase();
    console.log(JSON.stringify({
      success: true,
      stage: 'gmail_api_request',
      profileRequestSucceeded: true,
      mailboxEmail: email,
      configuredMailboxMatches: Boolean(email) && email === configuredEmail,
      enabled: configuration.enabled
    }, null, 2));
    if (!email || email !== configuredEmail) process.exitCode = 1;
  }
} catch (error) {
  console.log(JSON.stringify(reportError(error), null, 2));
  process.exitCode = 1;
}
