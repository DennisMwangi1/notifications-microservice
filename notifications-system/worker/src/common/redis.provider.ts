import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

const logger = new Logger('RedisProvider');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 5000);
    logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
    return delay;
  },
  lazyConnect: false,
});

redis.on('connect', () => logger.log('✅ Redis connected'));
redis.on('error', (err) => logger.error('❌ Redis error:', err.message));

export default redis;
