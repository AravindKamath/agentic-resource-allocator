import 'dotenv/config';

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8080),
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshSecret: process.env.REFRESH_SECRET,
  refreshExpiresIn: process.env.REFRESH_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  agent: {
    baseUrl: process.env.AGENT_BASE_URL || 'http://localhost:9000',
    timeoutMs: Number(process.env.AGENT_TIMEOUT_MS || 8000),
    retry: Number(process.env.AGENT_RETRY || 2)
  },
  resourceAutomation: {
    enabled: process.env.RESOURCE_AUTOMATION_ENABLED === 'true' || (
      process.env.RESOURCE_AUTOMATION_ENABLED !== 'false' &&
      (process.env.NODE_ENV || 'development') !== 'test'
    )
  },
  gmail: {
    enabled: process.env.GMAIL_ENABLED === 'true',
    adminEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase() || '',
    clientId: process.env.GMAIL_CLIENT_ID || '',
    clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
    redirectUri: process.env.GMAIL_REDIRECT_URI || '',
    refreshToken: process.env.GMAIL_REFRESH_TOKEN || '',
    userEmail: process.env.GMAIL_USER_EMAIL || '',
    writeRefreshToken: process.env.GMAIL_WRITE_REFRESH_TOKEN === 'true',
    label: process.env.GMAIL_LABEL || 'INBOX',
    pollIntervalMs: Number(process.env.GMAIL_POLL_INTERVAL_MS || 30000)
  },
  defaults: {
    autoCloseEnabled: process.env.AUTO_CLOSE_ENABLED === 'true',
    confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD || 0.78),
    slaHours: Number(process.env.SLA_HOURS || 24)
  }
};
