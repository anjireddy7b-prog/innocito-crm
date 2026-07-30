import Redis from 'ioredis';
import { env } from '@/config/env';
import { logger } from '@/config/logger';

/**
 * Redis-backed cache with an in-memory fallback so the app degrades
 * gracefully in environments without Redis (e.g. quick local dev).
 */
class CacheClient {
  private redis: Redis | null = null;
  private memory = new Map<string, { value: string; expiresAt: number | null }>();

  constructor() {
    if (env.REDIS_URL) {
      this.redis = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 2,
        lazyConnect: true,
        retryStrategy: (attempt) => (attempt > 3 ? null : Math.min(attempt * 200, 1000)),
      });
      this.redis.connect().catch(() => {
        logger.warn('Redis unavailable at startup, falling back to in-memory cache');
      });
      let warned = false;
      this.redis.on('error', (err) => {
        if (!warned) {
          logger.warn({ err: err.message }, 'Redis error — using in-memory cache until it recovers');
          warned = true;
        }
      });
      this.redis.on('ready', () => {
        warned = false;
        logger.info('Redis connected');
      });
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redis && this.redis.status === 'ready') {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    }
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async set(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
    const raw = JSON.stringify(value);
    if (this.redis && this.redis.status === 'ready') {
      await this.redis.set(key, raw, 'EX', ttlSeconds);
      return;
    }
    this.memory.set(key, { value: raw, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(pattern: string): Promise<void> {
    if (this.redis && this.redis.status === 'ready') {
      const keys = await this.redis.keys(pattern);
      if (keys.length) await this.redis.del(...keys);
      return;
    }
    for (const key of this.memory.keys()) {
      if (key.startsWith(pattern.replace('*', ''))) this.memory.delete(key);
    }
  }
}

export const cache = new CacheClient();
