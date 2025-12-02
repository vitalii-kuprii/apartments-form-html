import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { FastifyAdapter } from '@bull-board/fastify';
import { validateTelegramWebAppData } from './auth.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { searchRoutes } from './routes/searches.js';
import { apartmentRoutes } from './routes/apartments.js';
import { favoriteRoutes } from './routes/favorites.js';
import { getQueueStats, getApiStats, getAllCityTimestamps, getFetchQueue } from '../jobs/scheduler.js';
import { getMetrics, getMetricsContentType } from '../lib/metrics.js';

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'development' ? 'info' : 'warn',
  },
});

// Register CORS - allow Mini App origins
server.register(cors, {
  origin: [
    'https://web.telegram.org',
    /\.telegram\.org$/,
    /\.ngrok-free\.dev$/,
    /\.ngrok\.io$/,
    'http://localhost:5173',
    'http://localhost:3000',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data'],
});

// Auth middleware for protected routes
server.decorate('authenticate', async (request: any, reply: any) => {
  const initData = request.headers['x-telegram-init-data'] as string;

  if (!initData) {
    return reply.status(401).send({ error: 'Missing Telegram init data' });
  }

  const validation = validateTelegramWebAppData(initData);

  if (!validation.valid) {
    return reply.status(401).send({ error: 'Invalid Telegram init data' });
  }

  // Attach user data to request
  request.telegramUser = validation.user;
});

// Register routes
server.register(healthRoutes);
server.register(authRoutes, { prefix: '/api' });
server.register(searchRoutes, { prefix: '/api' });
server.register(apartmentRoutes, { prefix: '/api' });
server.register(favoriteRoutes, { prefix: '/api' });

// Stats endpoint for monitoring
server.get('/api/stats', async () => {
  const queueStats = await getQueueStats();
  const apiStats = await getApiStats();
  const cityTimestamps = await getAllCityTimestamps();

  return {
    queue: queueStats,
    api: apiStats,
    cities: cityTimestamps,
  };
});

// Prometheus metrics endpoint for Grafana scraping
server.get('/metrics', async (request, reply) => {
  const metrics = await getMetrics();
  reply.header('Content-Type', getMetricsContentType());
  return metrics;
});

// Bull Board visual dashboard for BullMQ job monitoring
async function setupBullBoard() {
  const queue = getFetchQueue();

  if (!queue) {
    console.log('[BullBoard] Queue not available yet. Dashboard will not be mounted.');
    return;
  }

  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [new BullMQAdapter(queue)],
    serverAdapter,
  });

  await server.register(serverAdapter.registerPlugin(), {
    prefix: '/admin/queues',
    basePath: '/admin/queues',
  });

  console.log('[BullBoard] Dashboard available at /admin/queues');
}

export async function startApiServer() {
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = '0.0.0.0';

  try {
    await server.listen({ port, host });
    console.log(`API server running on http://${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

export { server, setupBullBoard };
