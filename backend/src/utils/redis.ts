import Redis from 'ioredis';
import logger from './logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redisClient = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    logger.warn(`Redis reconnection attempt #${times} in ${delay}ms`);
    return delay;
  },
  lazyConnect: false,
});

redisClient.on('connect', () => logger.info('Redis connected'));
redisClient.on('error', (err) => logger.error('Redis connection error', { error: err.message }));
redisClient.on('close', () => logger.warn('Redis connection closed'));

export const getRedisClient = (): Redis => redisClient;
export const isRedisConnected = (): boolean => redisClient.status === 'ready';

export default redisClient;
