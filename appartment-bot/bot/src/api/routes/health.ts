import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';

export async function healthRoutes(fastify: FastifyInstance) {
  // Basic health check
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Detailed health check with dependencies
  fastify.get('/health/ready', async (_request, reply) => {
    const checks: Record<string, { status: string; latency?: number }> = {};

    // Check PostgreSQL
    try {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latency: Date.now() - start };
    } catch (error) {
      checks.database = { status: 'error' };
    }

    // Check Redis
    try {
      const start = Date.now();
      await redis.ping();
      checks.redis = { status: 'ok', latency: Date.now() - start };
    } catch (error) {
      checks.redis = { status: 'error' };
    }

    const allHealthy = Object.values(checks).every((c) => c.status === 'ok');

    return reply.status(allHealthy ? 200 : 503).send({
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    });
  });
}
