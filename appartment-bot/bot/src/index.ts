import 'dotenv/config';
import { startBot } from './bot/index.js';
import { startApiServer, setupBullBoard } from './api/server.js';
import { startScheduler } from './jobs/index.js';
import { logger } from './lib/logger.js';

logger.app.info('app.starting', 'Apartment Bot starting', {
  nodeEnv: process.env.NODE_ENV || 'development',
  nodeVersion: process.version,
  port: process.env.PORT || 3000,
});

async function main() {
  // Start BullMQ scheduler FIRST (creates the queue)
  // - No fetch 23:00-07:00 (Kyiv time)
  // - 1 hour intervals 07:00-09:00 and 19:00-23:00
  // - 30 min intervals 09:00-19:00 (peak hours)
  await startScheduler();
  logger.app.info('app.scheduler_ready', 'BullMQ scheduler started with flexible timing');

  // Setup Bull Board dashboard (must register BEFORE server.listen())
  await setupBullBoard();
  logger.app.info('app.bullboard_ready', 'Bull Board dashboard initialized');

  // Start API server (must be AFTER Bull Board setup)
  await startApiServer();
  logger.app.info('app.server_ready', 'API server started', {
    port: process.env.PORT || 3000,
  });

  // Start Telegram bot (this blocks forever)
  await startBot();
  logger.app.info('app.bot_ready', 'Telegram bot started');

  logger.app.info('app.ready', 'Application fully started and ready');
}

main().catch((err) => {
  logger.app.error('app.startup_failed', 'Failed to start application', {
    error: {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    },
  });
  process.exit(1);
});
