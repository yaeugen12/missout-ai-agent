/**
 * Transaction Cleanup Job
 *
 * Periodically cleans up old transaction hashes from the used_transactions table
 * to prevent indefinite database growth while maintaining security.
 */

import { cleanupOldTransactions } from "./transactionHashTracker";
import { logger, logError } from "./logger";

// Cleanup configuration
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Run every 24 hours
const DAYS_TO_KEEP = 30; // Keep transactions for 30 days

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start the cleanup job
 * Runs cleanup immediately on start, then every 24 hours
 */
export function startCleanupJob(): void {
  if (cleanupInterval) {
    logger.warn("[TX_CLEANUP] Cleanup job already running");
    return;
  }

  logger.info(`[TX_CLEANUP] Starting cleanup job (runs every 24 hours, keeps ${DAYS_TO_KEEP} days)`);

  // Run cleanup immediately on startup
  runCleanup();

  // Then schedule to run every 24 hours
  cleanupInterval = setInterval(() => {
    runCleanup();
  }, CLEANUP_INTERVAL_MS);
}

/**
 * Stop the cleanup job
 */
export function stopCleanupJob(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info("[TX_CLEANUP] Cleanup job stopped");
  }
}

/**
 * Run cleanup immediately (can be called manually)
 */
export async function runCleanup(): Promise<void> {
  try {
    logger.info(`[TX_CLEANUP] Starting cleanup of transactions older than ${DAYS_TO_KEEP} days...`);

    const deletedCount = await cleanupOldTransactions(DAYS_TO_KEEP);

    if (deletedCount > 0) {
      logger.info(`[TX_CLEANUP] ✅ Cleanup complete: Removed ${deletedCount} old transaction records`);
    } else {
      logger.info("[TX_CLEANUP] ✅ Cleanup complete: No old transactions to remove");
    }
  } catch (err: any) {
    logError(err, "[TX_CLEANUP] Error during cleanup");
  }
}

// Export configuration for testing/debugging
export const cleanupConfig = {
  intervalMs: CLEANUP_INTERVAL_MS,
  daysToKeep: DAYS_TO_KEEP,
};
