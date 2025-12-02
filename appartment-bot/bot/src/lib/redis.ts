import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Prevent multiple instances in development
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

// Connection event handlers
redis.on('connect', () => {
  console.log('Redis connected');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

export default redis;
