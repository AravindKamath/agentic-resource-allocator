import { connectDb } from './db.js';
import { createApp } from './app.js';
import { config, validateRuntimeConfig } from './config.js';
import { logger } from './logger.js';
import { startGmailPolling } from './services/emailService.js';
import mongoose from 'mongoose';

(async () => {
  let server;
  let stopPolling = () => Promise.resolve();
  try {
    validateRuntimeConfig();
    await connectDb();
    const app = createApp();
    server = app.listen(config.port, () => {
      logger.info(`API listening on :${config.port}`);
      stopPolling = startGmailPolling();
    });
    const shutdown = async (signal) => {
      logger.info({ signal }, 'Shutting down');
      await stopPolling();
      await new Promise((resolve) => server.close(resolve));
      await mongoose.disconnect();
    };
    process.once('SIGTERM', () => shutdown('SIGTERM').finally(() => process.exit(0)));
    process.once('SIGINT', () => shutdown('SIGINT').finally(() => process.exit(0)));
  } catch (e) {
    logger.error(e, 'Failed to start');
    process.exit(1);
  }
})();
