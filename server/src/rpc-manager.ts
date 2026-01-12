/**
 * RPC Failover Manager
 *
 * Provides robust RPC endpoint management with:
 * - Round-robin load balancing across multiple endpoints
 * - Exponential backoff on failures
 * - Automatic health checking and endpoint failover
 * - Request retries with circuit breaker pattern
 */

import { Connection, ConnectionConfig } from "@solana/web3.js/lib/index.cjs.js";
import { logger } from "./logger.js";

interface RPCEndpoint {
  url: string;
  connection: Connection | null;
  failures: number;
  lastFailureTime: number;
  isHealthy: boolean;
  consecutiveFailures: number;
  totalRequests: number;
  successfulRequests: number;
}

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const CIRCUIT_BREAKER_THRESHOLD = 5; // Mark unhealthy after 5 consecutive failures
const CIRCUIT_BREAKER_RESET_TIME = 60000; // 1 minute cooldown before retry

class RPCManager {
  private endpoints: RPCEndpoint[] = [];
  private currentIndex = 0;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG;

  constructor() {
    this.initializeEndpoints();
    this.startHealthChecks();
  }

  /**
   * Initialize RPC endpoints from environment variables
   */
  private initializeEndpoints(): void {
    const urls: string[] = [];

    // Support up to 5 RPC endpoints
    if (process.env.SOLANA_RPC_URL) urls.push(process.env.SOLANA_RPC_URL);
    if (process.env.SOLANA_RPC_URL_2) urls.push(process.env.SOLANA_RPC_URL_2);
    if (process.env.SOLANA_RPC_URL_3) urls.push(process.env.SOLANA_RPC_URL_3);
    if (process.env.SOLANA_RPC_URL_4) urls.push(process.env.SOLANA_RPC_URL_4);
    if (process.env.SOLANA_RPC_URL_5) urls.push(process.env.SOLANA_RPC_URL_5);

    if (urls.length === 0) {
      throw new Error("No RPC endpoints configured. Set SOLANA_RPC_URL in .env");
    }

    const connectionConfig: ConnectionConfig = {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 60000,
    };

    this.endpoints = urls.map((url) => ({
      url,
      connection: new Connection(url, connectionConfig),
      failures: 0,
      lastFailureTime: 0,
      isHealthy: true,
      consecutiveFailures: 0,
      totalRequests: 0,
      successfulRequests: 0,
    }));

    logger.info(`[RPC Manager] Initialized with ${this.endpoints.length} endpoint(s)`, {
      endpoints: urls.map((url, i) => `RPC${i + 1}: ${this.maskUrl(url)}`),
    });
  }

  /**
   * Mask sensitive parts of RPC URL for logging
   */
  private maskUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      if (urlObj.searchParams.has("api-key")) {
        urlObj.searchParams.set("api-key", "***");
      }
      return urlObj.toString().replace(/\/[a-zA-Z0-9_-]{20,}\/?$/, "/***");
    } catch {
      return url.substring(0, 30) + "...";
    }
  }

  /**
   * Get next healthy endpoint using round-robin
   */
  private getNextHealthyEndpoint(): RPCEndpoint | null {
    const startIndex = this.currentIndex;
    const now = Date.now();

    // Try each endpoint in round-robin fashion
    for (let i = 0; i < this.endpoints.length; i++) {
      this.currentIndex = (startIndex + i) % this.endpoints.length;
      const endpoint = this.endpoints[this.currentIndex];

      // Check if endpoint is healthy or if cooldown period has passed
      if (
        endpoint.isHealthy ||
        now - endpoint.lastFailureTime > CIRCUIT_BREAKER_RESET_TIME
      ) {
        // Reset consecutive failures if cooldown passed
        if (now - endpoint.lastFailureTime > CIRCUIT_BREAKER_RESET_TIME) {
          endpoint.consecutiveFailures = 0;
          endpoint.isHealthy = true;
        }

        // Move to next endpoint for next request (round-robin)
        this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
        return endpoint;
      }
    }

    // All endpoints unhealthy - return least recently failed
    logger.warn("[RPC Manager] All endpoints unhealthy, using least recently failed");
    return this.endpoints.reduce((prev, curr) =>
      prev.lastFailureTime < curr.lastFailureTime ? prev : curr
    );
  }

  /**
   * Mark endpoint as failed and update circuit breaker
   */
  private recordFailure(endpoint: RPCEndpoint, error: any): void {
    endpoint.failures++;
    endpoint.consecutiveFailures++;
    endpoint.lastFailureTime = Date.now();
    endpoint.totalRequests++;

    if (endpoint.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      endpoint.isHealthy = false;
      logger.warn(`[RPC Manager] Circuit breaker opened for ${this.maskUrl(endpoint.url)}`, {
        consecutiveFailures: endpoint.consecutiveFailures,
        totalFailures: endpoint.failures,
        errorMessage: error?.message,
      });
    }
  }

  /**
   * Mark endpoint as successful
   */
  private recordSuccess(endpoint: RPCEndpoint): void {
    endpoint.consecutiveFailures = 0;
    endpoint.successfulRequests++;
    endpoint.totalRequests++;

    if (!endpoint.isHealthy) {
      endpoint.isHealthy = true;
      logger.info(`[RPC Manager] Endpoint recovered: ${this.maskUrl(endpoint.url)}`);
    }
  }

  /**
   * Execute RPC call with failover and retry logic
   */
  async executeWithFailover<T>(
    operation: (connection: Connection) => Promise<T>,
    operationName: string = "RPC call"
  ): Promise<T> {
    let lastError: any;

    // Try each endpoint
    for (let attempt = 0; attempt < this.endpoints.length; attempt++) {
      const endpoint = this.getNextHealthyEndpoint();

      if (!endpoint || !endpoint.connection) {
        throw new Error("No RPC endpoints available");
      }

      // Try with exponential backoff
      for (let retry = 0; retry <= this.retryConfig.maxRetries; retry++) {
        try {
          const result = await operation(endpoint.connection);
          this.recordSuccess(endpoint);
          return result;
        } catch (error: any) {
          lastError = error;

          // Don't retry on certain errors
          if (this.isNonRetryableError(error)) {
            this.recordFailure(endpoint, error);
            throw error;
          }

          // Calculate backoff delay
          if (retry < this.retryConfig.maxRetries) {
            const delay = Math.min(
              this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, retry),
              this.retryConfig.maxDelayMs
            );

            logger.warn(`[RPC Manager] ${operationName} failed, retrying in ${delay}ms`, {
              endpoint: this.maskUrl(endpoint.url),
              attempt: retry + 1,
              maxRetries: this.retryConfig.maxRetries,
              error: error?.message,
            });

            await this.sleep(delay);
          }
        }
      }

      // All retries failed for this endpoint
      this.recordFailure(endpoint, lastError);
      logger.error(
        `${operationName} failed after ${this.retryConfig.maxRetries} retries`,
        `RPC Manager - ${this.maskUrl(endpoint.url)}`,
        { error: lastError?.message }
      );
    }

    // All endpoints exhausted
    throw new Error(
      `${operationName} failed on all ${this.endpoints.length} RPC endpoint(s): ${lastError?.message || "Unknown error"}`
    );
  }

  /**
   * Check if error should not be retried
   */
  private isNonRetryableError(error: any): boolean {
    const message = error?.message?.toLowerCase() || "";

    // Don't retry on these errors
    const nonRetryablePatterns = [
      "invalid params",
      "transaction already processed",
      "blockhash not found",
      "invalid transaction",
      "account not found",
    ];

    return nonRetryablePatterns.some((pattern) => message.includes(pattern));
  }

  /**
   * Sleep utility for backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get primary connection (for backwards compatibility)
   */
  getConnection(): Connection {
    const endpoint = this.getNextHealthyEndpoint();
    if (!endpoint?.connection) {
      throw new Error("No healthy RPC endpoints available");
    }
    return endpoint.connection;
  }

  /**
   * Perform health check on all endpoints
   */
  private async healthCheck(): Promise<void> {
    const checks = this.endpoints.map(async (endpoint) => {
      if (!endpoint.connection) return;

      try {
        const slot = await endpoint.connection.getSlot();
        if (typeof slot === "number" && slot > 0) {
          if (!endpoint.isHealthy) {
            endpoint.isHealthy = true;
            endpoint.consecutiveFailures = 0;
            logger.info(`[RPC Manager] Health check passed: ${this.maskUrl(endpoint.url)}`);
          }
        }
      } catch (error: any) {
        logger.warn(`[RPC Manager] Health check failed: ${this.maskUrl(endpoint.url)}`, {
          error: error?.message,
        });
      }
    });

    await Promise.allSettled(checks);
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      this.healthCheck().catch((err) => {
        logger.error(err, "RPC Manager health check error");
      });
    }, HEALTH_CHECK_INTERVAL);

    // Run initial health check
    this.healthCheck().catch((err) => {
      logger.error(err, "Initial RPC health check error");
    });
  }

  /**
   * Get statistics about RPC endpoints
   */
  getStats() {
    const healthyCount = this.endpoints.filter((e) => e.isHealthy).length;

    return {
      totalEndpoints: this.endpoints.length,
      healthyEndpoints: healthyCount,
      endpoints: this.endpoints.map((e) => ({
        url: this.maskUrl(e.url),
        isHealthy: e.isHealthy,
        totalRequests: e.totalRequests,
        successfulRequests: e.successfulRequests,
        failures: e.failures,
        consecutiveFailures: e.consecutiveFailures,
        successRate:
          e.totalRequests > 0
            ? ((e.successfulRequests / e.totalRequests) * 100).toFixed(2) + "%"
            : "N/A",
      })),
    };
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    logger.info("[RPC Manager] Shutdown complete");
  }
}

// Export singleton instance
export const rpcManager = new RPCManager();

// Export helper function for direct use
export async function withRPCFailover<T>(
  operation: (connection: Connection) => Promise<T>,
  operationName?: string
): Promise<T> {
  return rpcManager.executeWithFailover(operation, operationName);
}
