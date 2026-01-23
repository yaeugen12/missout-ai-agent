/**
 * Real-Time Price Tracking Service
 *
 * Maintains real-time price updates for active pools.
 * Updates pool.currentPriceUsd every 2-3 seconds and broadcasts via WebSocket.
 */

import { logger } from "../logger.js";
import type { NotificationService } from "../notifications/notificationService.js";
import type { Storage } from "../storage.js";
import { fetchTokenPriceUsd } from "../utils/priceUtils.js";

interface PriceCache {
  price: number;
  timestamp: number;
}

export class PriceTrackingService {
  private poolTrackers = new Map<number, NodeJS.Timeout>();
  private priceCache = new Map<string, PriceCache>();
  private readonly CACHE_DURATION_MS = 2500; // Cache for 2.5 seconds (same as update interval)
  private readonly UPDATE_INTERVAL_MS = 2500; // Update every 2.5 seconds

  constructor(
    private storage: Storage,
    private notificationService: NotificationService | null
  ) {
    logger.info("[PriceTrackingService] Initialized");
  }

  /**
   * Fetches token price with caching to avoid rate limits
   */
  private async fetchTokenPrice(tokenMint: string): Promise<number | null> {
    // Check cache first
    const cached = this.priceCache.get(tokenMint);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION_MS) {
      return cached.price;
    }

    try {
      const price = await fetchTokenPriceUsd(tokenMint);

      if (price && price > 0) {
        // Update cache
        this.priceCache.set(tokenMint, {
          price,
          timestamp: Date.now(),
        });
        return price;
      }

      return null;
    } catch (error) {
      logger.error(`[PriceTracking] Failed to fetch price for ${tokenMint}:`, error);
      return cached?.price || null; // Return cached price as fallback
    }
  }

  /**
   * Starts real-time price tracking for a pool
   */
  async startTracking(poolId: number, tokenMint: string): Promise<void> {
    // Don't track if already tracking
    if (this.poolTrackers.has(poolId)) {
      logger.warn(`[PriceTracking] Pool ${poolId} is already being tracked`);
      return;
    }

    logger.info(`[PriceTracking] Starting price tracking for pool ${poolId} (${tokenMint})`);

    // Fetch initial price immediately
    const initialPrice = await this.fetchTokenPrice(tokenMint);
    if (initialPrice) {
      await this.storage.updatePoolPrice(poolId, initialPrice);
      this.notificationService?.broadcastPriceUpdate(poolId, initialPrice);
    }

    // Set up interval for continuous updates
    const interval = setInterval(async () => {
      try {
        const price = await this.fetchTokenPrice(tokenMint);

        if (price && price > 0) {
          // Update database
          await this.storage.updatePoolPrice(poolId, price);

          // Broadcast to WebSocket clients
          this.notificationService?.broadcastPriceUpdate(poolId, price);

          logger.debug(`[PriceTracking] Pool ${poolId}: Updated price to $${price.toFixed(6)}`);
        } else {
          logger.warn(`[PriceTracking] Pool ${poolId}: Failed to fetch price`);
        }
      } catch (error) {
        logger.error(`[PriceTracking] Pool ${poolId}: Error updating price:`, error);
      }
    }, this.UPDATE_INTERVAL_MS);

    this.poolTrackers.set(poolId, interval);
    logger.info(`[PriceTracking] Pool ${poolId}: Tracking started (updates every ${this.UPDATE_INTERVAL_MS}ms)`);
  }

  /**
   * Stops price tracking for a pool (when pool ends)
   */
  stopTracking(poolId: number): void {
    const interval = this.poolTrackers.get(poolId);

    if (interval) {
      clearInterval(interval);
      this.poolTrackers.delete(poolId);
      logger.info(`[PriceTracking] Pool ${poolId}: Tracking stopped`);
    } else {
      logger.warn(`[PriceTracking] Pool ${poolId}: Was not being tracked`);
    }
  }

  /**
   * Stops all active price tracking (for shutdown)
   */
  stopAll(): void {
    logger.info(`[PriceTracking] Stopping all price tracking (${this.poolTrackers.size} active pools)`);

    for (const [poolId, interval] of this.poolTrackers.entries()) {
      clearInterval(interval);
      logger.debug(`[PriceTracking] Stopped tracking pool ${poolId}`);
    }

    this.poolTrackers.clear();
    this.priceCache.clear();
    logger.info("[PriceTracking] All tracking stopped");
  }

  /**
   * Returns the number of actively tracked pools
   */
  getActiveTrackersCount(): number {
    return this.poolTrackers.size;
  }

  /**
   * Resume tracking for all active/locked pools on service restart
   */
  async resumeTrackingForActivePools(): Promise<void> {
    logger.info("[PriceTracking] Resuming tracking for active pools...");

    try {
      const activePools = await this.storage.getActivePoolsForPriceTracking();

      for (const pool of activePools) {
        if (pool.tokenMint) {
          await this.startTracking(pool.id, pool.tokenMint);
        }
      }

      logger.info(`[PriceTracking] Resumed tracking for ${activePools.length} active pools`);
    } catch (error) {
      logger.error("[PriceTracking] Failed to resume tracking for active pools:", error);
    }
  }
}

// Singleton instance
let priceTrackingService: PriceTrackingService | null = null;

export function initializePriceTrackingService(
  storage: Storage,
  notificationService: NotificationService | null
): PriceTrackingService {
  if (!priceTrackingService) {
    priceTrackingService = new PriceTrackingService(storage, notificationService);
  }
  return priceTrackingService;
}

export function getPriceTrackingService(): PriceTrackingService {
  if (!priceTrackingService) {
    throw new Error("PriceTrackingService not initialized. Call initializePriceTrackingService first.");
  }
  return priceTrackingService;
}
