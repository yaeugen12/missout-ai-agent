import Redis from 'ioredis';
import { logger } from './logger';

// Initialize Redis client (supports Upstash Redis)
// FREE tier: Upstash provides 10,000 commands/day
// Set REDIS_URL in .env: redis://:password@endpoint:port
let redis: Redis | null = null;

export function initRedis() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    logger.warn('REDIS_URL not configured - caching disabled');
    return;
  }

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redis.on('error', (err) => {
      logger.error('Redis error', { error: err.message });
    });

    redis.on('close', () => {
      logger.warn('Redis connection closed');
    });
  } catch (err: any) {
    logger.error('Failed to initialize Redis', { error: err.message });
  }
}

// Generic cache helpers
export async function getCached<T>(key: string): Promise<T | null> {
  if (!redis) return null;

  try {
    const cached = await redis.get(key);
    if (!cached) return null;
    return JSON.parse(cached) as T;
  } catch (err: any) {
    logger.error('Cache get error', { key, error: err.message });
    return null;
  }
}

export async function setCached<T>(key: string, value: T, ttlSeconds = 3600): Promise<void> {
  if (!redis) return;

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err: any) {
    logger.error('Cache set error', { key, error: err.message });
  }
}

export async function deleteCached(key: string): Promise<void> {
  if (!redis) return;

  try {
    await redis.del(key);
  } catch (err: any) {
    logger.error('Cache delete error', { key, error: err.message });
  }
}

export async function invalidatePattern(pattern: string): Promise<void> {
  if (!redis) return;

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err: any) {
    logger.error('Cache invalidate error', { pattern, error: err.message });
  }
}

// Domain-specific cache helpers

/**
 * Cache token metadata from Helius API
 * TTL: 1 hour (metadata rarely changes)
 */
export async function getCachedTokenMetadata(mint: string) {
  return getCached<any>(`token:metadata:${mint}`);
}

export async function setCachedTokenMetadata(mint: string, metadata: any) {
  return setCached(`token:metadata:${mint}`, metadata, 3600); // 1 hour
}

/**
 * Cache pool data
 * TTL: 30 seconds (updates frequently)
 */
export async function getCachedPool(poolId: number) {
  return getCached<any>(`pool:${poolId}`);
}

export async function setCachedPool(poolId: number, pool: any) {
  return setCached(`pool:${poolId}`, pool, 30); // 30 seconds
}

export async function invalidatePoolCache(poolId: number) {
  return deleteCached(`pool:${poolId}`);
}

/**
 * Cache pool list
 * TTL: 10 seconds
 */
export async function getCachedPools() {
  return getCached<any[]>('pools:list');
}

export async function setCachedPools(pools: any[]) {
  return setCached('pools:list', pools, 10); // 10 seconds
}

export async function invalidatePoolsCache() {
  await deleteCached('pools:list');
  await invalidatePattern('pool:*');
}

/**
 * Cache leaderboard
 * TTL: 5 minutes
 */
export async function getCachedLeaderboard() {
  return getCached<any[]>('leaderboard');
}

export async function setCachedLeaderboard(data: any[]) {
  return setCached('leaderboard', data, 300); // 5 minutes
}

export { redis };
