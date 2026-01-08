/**
 * Transaction Hash Tracker
 *
 * Prevents replay attacks by tracking all used transaction hashes in the database.
 * Uses PostgreSQL's UNIQUE constraint on tx_hash to prevent race conditions.
 */

import { pool } from "./db";
import { logger, logError } from "./logger";

export interface UsedTransaction {
  txHash: string;
  poolId: number;
  walletAddress: string;
  operationType: string;
  usedAt: Date;
}

/**
 * Check if a transaction hash has already been used
 *
 * @param txHash - Solana transaction signature
 * @returns true if transaction has been used, false otherwise
 */
export async function isTxHashUsed(txHash: string): Promise<boolean> {
  try {
    const result = await pool.query(
      "SELECT tx_hash FROM used_transactions WHERE tx_hash = $1",
      [txHash]
    );

    return result.rows.length > 0;
  } catch (err: any) {
    logError(err, `[TX_TRACKER] Error checking if tx_hash is used: ${txHash.slice(0, 16)}...`);
    throw new Error(`Failed to check transaction hash: ${err.message}`);
  }
}

/**
 * Mark a transaction hash as used
 *
 * IMPORTANT: This function will THROW if the transaction hash is already used.
 * This is intentional - PostgreSQL's UNIQUE constraint prevents race conditions.
 *
 * @param txHash - Solana transaction signature
 * @param poolId - Pool ID associated with this transaction
 * @param walletAddress - Wallet address that submitted the transaction
 * @param operationType - Type of operation (join, donate, cancel, claim_refund, claim_rent, create_pool)
 * @throws Error if transaction hash is already used (SQLSTATE 23505)
 */
export async function markTxHashUsed(
  txHash: string,
  poolId: number,
  walletAddress: string,
  operationType: string
): Promise<void> {
  try {
    logger.info(
      `[TX_TRACKER] Marking tx_hash as used: ${txHash.slice(0, 16)}... pool=${poolId} wallet=${walletAddress.slice(0, 16)}... op=${operationType}`
    );

    await pool.query(
      `INSERT INTO used_transactions (tx_hash, pool_id, wallet_address, operation_type)
       VALUES ($1, $2, $3, $4)`,
      [txHash, poolId, walletAddress, operationType]
    );

    logger.info(`[TX_TRACKER] ✅ Transaction marked as used: ${txHash.slice(0, 16)}...`);
  } catch (err: any) {
    // PostgreSQL unique violation error code
    if (err.code === "23505") {
      logger.warn(
        `[TX_TRACKER] ⚠️ Transaction hash already used (duplicate): ${txHash.slice(0, 16)}...`
      );
      throw new Error("Transaction hash already used. Possible replay attack detected.");
    }

    logError(err, `[TX_TRACKER] Error marking tx_hash as used: ${txHash.slice(0, 16)}...`);
    throw new Error(`Failed to mark transaction hash as used: ${err.message}`);
  }
}

/**
 * Get transaction usage details
 *
 * @param txHash - Solana transaction signature
 * @returns Transaction usage details or null if not found
 */
export async function getTxHashUsage(txHash: string): Promise<UsedTransaction | null> {
  try {
    const result = await pool.query(
      `SELECT tx_hash, pool_id, wallet_address, operation_type, used_at
       FROM used_transactions
       WHERE tx_hash = $1`,
      [txHash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      txHash: result.rows[0].tx_hash,
      poolId: result.rows[0].pool_id,
      walletAddress: result.rows[0].wallet_address,
      operationType: result.rows[0].operation_type,
      usedAt: result.rows[0].used_at,
    };
  } catch (err: any) {
    logError(err, `[TX_TRACKER] Error getting tx_hash usage: ${txHash.slice(0, 16)}...`);
    throw new Error(`Failed to get transaction hash usage: ${err.message}`);
  }
}

/**
 * Clean up old transaction records
 * Removes transactions older than the specified number of days
 *
 * @param daysToKeep - Number of days to keep transaction records (default: 30)
 * @returns Number of records deleted
 */
export async function cleanupOldTransactions(daysToKeep: number = 30): Promise<number> {
  try {
    logger.info(`[TX_TRACKER] Starting cleanup of transactions older than ${daysToKeep} days...`);

    const result = await pool.query(
      `DELETE FROM used_transactions
       WHERE used_at < NOW() - INTERVAL '${daysToKeep} days'
       RETURNING tx_hash`,
    );

    const deletedCount = result.rows.length;

    logger.info(`[TX_TRACKER] ✅ Cleanup complete: Removed ${deletedCount} old transaction records`);

    return deletedCount;
  } catch (err: any) {
    logError(err, `[TX_TRACKER] Error during cleanup of old transactions`);
    throw new Error(`Failed to cleanup old transactions: ${err.message}`);
  }
}

/**
 * Get statistics about transaction usage
 *
 * @returns Statistics object
 */
export async function getTransactionStats(): Promise<{
  total: number;
  byOperation: Record<string, number>;
  last24Hours: number;
}> {
  try {
    // Total count
    const totalResult = await db.query("SELECT COUNT(*) as count FROM used_transactions");
    const total = parseInt(totalResult.rows[0].count);

    // Count by operation type
    const byOperationResult = await db.query(`
      SELECT operation_type, COUNT(*) as count
      FROM used_transactions
      GROUP BY operation_type
    `);

    const byOperation: Record<string, number> = {};
    for (const row of byOperationResult.rows) {
      byOperation[row.operation_type] = parseInt(row.count);
    }

    // Count in last 24 hours
    const last24HoursResult = await db.query(`
      SELECT COUNT(*) as count
      FROM used_transactions
      WHERE used_at > NOW() - INTERVAL '24 hours'
    `);
    const last24Hours = parseInt(last24HoursResult.rows[0].count);

    return {
      total,
      byOperation,
      last24Hours,
    };
  } catch (err: any) {
    logError(err, `[TX_TRACKER] Error getting transaction stats`);
    throw new Error(`Failed to get transaction stats: ${err.message}`);
  }
}
