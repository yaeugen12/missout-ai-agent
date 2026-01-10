/**
 * Redis Cache Middleware
 *
 * Provides Express middleware for caching API responses
 */

import type { Request, Response, NextFunction } from 'express';
import { getCache, setCache, isRedisEnabled } from './redis';
import { logger } from './logger';

interface CacheOptions {
  /**
   * Cache TTL in seconds
   * @default 60
   */
  ttl?: number;

  /**
   * Custom cache key generator
   * @default `${req.method}:${req.path}:${JSON.stringify(req.query)}`
   */
  keyGenerator?: (req: Request) => string;

  /**
   * Skip caching based on request
   */
  skip?: (req: Request) => boolean;
}

/**
 * Default cache key generator
 */
function defaultKeyGenerator(req: Request): string {
  const queryString = Object.keys(req.query).length
    ? `:${JSON.stringify(req.query)}`
    : '';
  return `api:${req.method}:${req.path}${queryString}`;
}

/**
 * Cache middleware for Express routes
 *
 * @example
 * ```typescript
 * app.get('/api/pools', cacheMiddleware({ ttl: 120 }), async (req, res) => {
 *   const pools = await getPools();
 *   res.json(pools);
 * });
 * ```
 */
export function cacheMiddleware(options: CacheOptions = {}) {
  const {
    ttl = 60,
    keyGenerator = defaultKeyGenerator,
    skip = () => false,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip if Redis is not enabled
    if (!isRedisEnabled()) {
      return next();
    }

    // Skip if condition is met
    if (skip(req)) {
      return next();
    }

    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    try {
      const cacheKey = keyGenerator(req);

      // Try to get from cache
      const cachedData = await getCache(cacheKey);

      if (cachedData) {
        logger.debug('Cache HIT', { key: cacheKey });

        // Set cache header
        res.setHeader('X-Cache', 'HIT');

        // Return cached response
        return res.json(cachedData);
      }

      logger.debug('Cache MISS', { key: cacheKey });

      // Set cache header
      res.setHeader('X-Cache', 'MISS');

      // Capture original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache response
      res.json = function (data: any) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          setCache(cacheKey, data, ttl).catch((err) => {
            logger.error('Failed to cache response', {
              key: cacheKey,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }

        return originalJson(data);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error', {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
      });

      // Continue without caching on error
      next();
    }
  };
}

/**
 * Cache invalidation helper for use in POST/PUT/DELETE routes
 *
 * @example
 * ```typescript
 * app.post('/api/pools', async (req, res) => {
 *   const pool = await createPool(req.body);
 *   await invalidateCache('api:GET:/api/pools*');
 *   res.json(pool);
 * });
 * ```
 */
export async function invalidateCache(pattern: string): Promise<number> {
  if (!isRedisEnabled()) {
    return 0;
  }

  try {
    const { delCachePattern } = await import('./redis');
    const deletedCount = await delCachePattern(pattern);

    logger.info('Cache invalidated', {
      pattern,
      deletedCount,
    });

    return deletedCount;
  } catch (error) {
    logger.error('Cache invalidation error', {
      pattern,
      error: error instanceof Error ? error.message : String(error),
    });

    return 0;
  }
}
