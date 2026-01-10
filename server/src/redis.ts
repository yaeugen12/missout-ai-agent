/**
 * Redis Client Singleton for Caching
 *
 * This module provides a centralized Redis client for the entire application.
 * Redis is optional - if REDIS_URL is not configured, caching will be disabled.
 *
 * Usage:
 * ```typescript
 * import { redisClient, isRedisEnabled } from './redis.js';
 *
 * if (isRedisEnabled()) {
 *   await redisClient.set('key', 'value', 'EX', 60);
 *   const value = await redisClient.get('key');
 * }
 * ```
 */

import Redis from 'ioredis';
import { logger } from './logger.js';

let redisClient: Redis | null = null;
let isEnabled = false;

/**
 * Initialize Redis connection
 */
function initRedis(): Redis | null {
  if (!process.env.REDIS_URL) {
    console.log('[REDIS] ⚠️  REDIS_URL not configured - caching disabled');
    return null;
  }

  try {
    const client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError(err) {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
        if (targetErrors.some(target => err.message.includes(target))) {
          return true; // Reconnect
        }
        return false;
      },
    });

    client.on('connect', () => {
      console.log('[REDIS] ✅ Connected to Redis successfully');
      isEnabled = true;
    });

    client.on('error', (err) => {
      console.error('[REDIS] ❌ Connection error:', err.message);
      logger.error('Redis connection error', {
        error: err.message,
        stack: err.stack,
      });
      isEnabled = false;
    });

    client.on('reconnecting', () => {
      console.log('[REDIS] 🔄 Reconnecting to Redis...');
    });

    return client;
  } catch (error) {
    console.error('[REDIS] ❌ Failed to initialize Redis:', error);
    return null;
  }
}

// Initialize Redis client
redisClient = initRedis();

/**
 * Check if Redis is enabled and connected
 */
export function isRedisEnabled(): boolean {
  return isEnabled && redisClient !== null;
}

/**
 * Get cached value
 */
export async function getCache<T = string>(key: string): Promise<T | null> {
  if (!isRedisEnabled() || !redisClient) {
    return null;
  }

  try {
    const value = await redisClient.get(key);
    if (!value) return null;

    // Try to parse as JSON, otherwise return as string
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  } catch (error) {
    logger.error('Redis GET error', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Set cached value with optional TTL (in seconds)
 */
export async function setCache(
  key: string,
  value: any,
  ttl?: number
): Promise<boolean> {
  if (!isRedisEnabled() || !redisClient) {
    return false;
  }

  try {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

    if (ttl) {
      await redisClient.setex(key, ttl, stringValue);
    } else {
      await redisClient.set(key, stringValue);
    }

    return true;
  } catch (error) {
    logger.error('Redis SET error', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Delete cached value
 */
export async function delCache(key: string): Promise<boolean> {
  if (!isRedisEnabled() || !redisClient) {
    return false;
  }

  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    logger.error('Redis DEL error', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Delete all keys matching a pattern
 */
export async function delCachePattern(pattern: string): Promise<number> {
  if (!isRedisEnabled() || !redisClient) {
    return 0;
  }

  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length === 0) return 0;

    await redisClient.del(...keys);
    return keys.length;
  } catch (error) {
    logger.error('Redis DEL pattern error', {
      pattern,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/**
 * Check if key exists
 */
export async function existsCache(key: string): Promise<boolean> {
  if (!isRedisEnabled() || !redisClient) {
    return false;
  }

  try {
    const exists = await redisClient.exists(key);
    return exists === 1;
  } catch (error) {
    logger.error('Redis EXISTS error', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Increment counter
 */
export async function incrCache(key: string): Promise<number | null> {
  if (!isRedisEnabled() || !redisClient) {
    return null;
  }

  try {
    return await redisClient.incr(key);
  } catch (error) {
    logger.error('Redis INCR error', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Get Redis client stats
 */
export async function getRedisStats() {
  if (!isRedisEnabled() || !redisClient) {
    return {
      enabled: false,
      connected: false,
    };
  }

  try {
    const info = await redisClient.info('stats');
    const dbSize = await redisClient.dbsize();

    return {
      enabled: true,
      connected: redisClient.status === 'ready',
      dbSize,
      status: redisClient.status,
      info,
    };
  } catch (error) {
    return {
      enabled: true,
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Gracefully close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    console.log('[REDIS] Connection closed');
  }
}

// Export the client for advanced usage
export { redisClient };
