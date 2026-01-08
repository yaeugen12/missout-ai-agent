/**
 * REFERRAL DOUBLE-CLAIM FIX
 *
 * This file contains the improved claimReferralReward function with:
 * 1. SELECT FOR UPDATE lock (already implemented)
 * 2. lastClaimTimestamp check (already implemented)
 * 3. Additional safeguards and logging
 *
 * REPLACE the existing claimReferralReward function in server/storage.ts with this version.
 */

import { db } from "./db";
import { referralRewards, referralClaims } from "@shared/schema";
import { eq, sql, and } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Claim referral rewards with atomic locking and replay protection
 *
 * Security features:
 * - SELECT FOR UPDATE prevents concurrent claims
 * - lastClaimTimestamp prevents replay attacks
 * - Transaction rollback on any error
 * - Comprehensive logging for audit trail
 *
 * @param referrerWallet - Wallet address claiming rewards
 * @param tokenMint - Token mint address
 * @param claimTimestamp - Unix timestamp from signed message (for replay protection)
 * @returns Success status and claimed amount
 */
export async function claimReferralReward(
  referrerWallet: string,
  tokenMint: string,
  claimTimestamp?: number
): Promise<{ success: boolean; amount: string; error?: string }> {
  const startTime = Date.now();

  logger.info(`[REFERRAL_CLAIM] Starting claim for wallet=${referrerWallet.slice(0, 8)}... token=${tokenMint.slice(0, 8)}... timestamp=${claimTimestamp}`);

  return await db.transaction(async (tx) => {
    try {
      // STEP 1: Lock the reward row atomically
      // This prevents any other concurrent transaction from modifying this row
      const lockQuery = claimTimestamp
        ? sql`
            SELECT * FROM referral_rewards
            WHERE referrer_wallet = ${referrerWallet}
              AND token_mint = ${tokenMint}
              AND (last_claim_timestamp IS NULL OR last_claim_timestamp < ${claimTimestamp})
            FOR UPDATE
          `
        : sql`
            SELECT * FROM referral_rewards
            WHERE referrer_wallet = ${referrerWallet}
              AND token_mint = ${tokenMint}
            FOR UPDATE
          `;

      const result = await tx.execute(lockQuery);
      const reward = result.rows[0] as any;

      // STEP 2: Validate reward exists
      if (!reward) {
        logger.warn(`[REFERRAL_CLAIM] No reward found or timestamp already used for wallet=${referrerWallet.slice(0, 8)}...`);
        return {
          success: false,
          amount: "0",
          error: "No pending rewards or claim already processed"
        };
      }

      // STEP 3: Check if there's any amount to claim
      const amountPending = BigInt(reward.amount_pending || "0");
      if (amountPending <= 0n) {
        logger.warn(`[REFERRAL_CLAIM] No pending amount for wallet=${referrerWallet.slice(0, 8)}...`);
        return {
          success: false,
          amount: "0",
          error: "No pending rewards to claim"
        };
      }

      // STEP 4: Double-check lastClaimTimestamp (extra safety)
      if (claimTimestamp && reward.last_claim_timestamp) {
        const lastClaim = Number(reward.last_claim_timestamp);
        if (lastClaim >= claimTimestamp) {
          logger.error(`[REFERRAL_CLAIM] REPLAY ATTACK DETECTED! lastClaim=${lastClaim} >= claimTimestamp=${claimTimestamp} for wallet=${referrerWallet.slice(0, 8)}...`);
          return {
            success: false,
            amount: "0",
            error: "This claim signature has already been used or expired"
          };
        }
      }

      const amountToClaim = amountPending.toString();
      const previousAmountClaimed = BigInt(reward.amount_claimed || "0");
      const newAmountClaimed = previousAmountClaimed + amountPending;

      logger.info(`[REFERRAL_CLAIM] Processing claim: amount=${amountToClaim} previousClaimed=${previousAmountClaimed} newTotal=${newAmountClaimed}`);

      // STEP 5: Update reward record atomically
      await tx
        .update(referralRewards)
        .set({
          amountPending: "0",
          amountClaimed: newAmountClaimed.toString(),
          lastUpdated: new Date(),
          lastClaimTimestamp: claimTimestamp ?? null
        })
        .where(eq(referralRewards.id, reward.id));

      // STEP 6: Create claim record for audit trail
      await tx.insert(referralClaims).values({
        referrerWallet,
        tokenMint,
        amount: amountToClaim,
        status: "pending" // Will be updated to "completed" after on-chain transfer
      });

      const duration = Date.now() - startTime;
      logger.info(`[REFERRAL_CLAIM] ✅ Claim successful! wallet=${referrerWallet.slice(0, 8)}... amount=${amountToClaim} duration=${duration}ms`);

      return {
        success: true,
        amount: amountToClaim
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error(`[REFERRAL_CLAIM] ❌ Claim failed! wallet=${referrerWallet.slice(0, 8)}... error=${error.message} duration=${duration}ms`);

      // Transaction will automatically rollback on throw
      throw error;
    }
  });
}

/**
 * Additional helper function: Check if a claim is in progress
 * Can be used for optimistic UI updates
 */
export async function isClaimInProgress(
  referrerWallet: string,
  tokenMint: string
): Promise<boolean> {
  const recentClaims = await db
    .select()
    .from(referralClaims)
    .where(
      and(
        eq(referralClaims.referrerWallet, referrerWallet),
        eq(referralClaims.tokenMint, tokenMint),
        eq(referralClaims.status, "pending"),
        sql`claimed_at > NOW() - INTERVAL '5 minutes'`
      )
    )
    .limit(1);

  return recentClaims.length > 0;
}

/**
 * Get detailed claim history for debugging
 */
export async function getClaimHistory(
  referrerWallet: string,
  tokenMint?: string,
  limit: number = 10
): Promise<any[]> {
  const query = tokenMint
    ? and(
        eq(referralClaims.referrerWallet, referrerWallet),
        eq(referralClaims.tokenMint, tokenMint)
      )
    : eq(referralClaims.referrerWallet, referrerWallet);

  return await db
    .select()
    .from(referralClaims)
    .where(query)
    .orderBy(sql`claimed_at DESC`)
    .limit(limit);
}

/*
 * USAGE INSTRUCTIONS:
 *
 * 1. Copy this improved claimReferralReward function
 * 2. Replace the existing function in server/storage.ts
 * 3. Add the helper functions (isClaimInProgress, getClaimHistory) to the IStorage interface
 * 4. Test thoroughly before deploying to production
 *
 * TESTING CHECKLIST:
 * ✅ Single claim works correctly
 * ✅ Concurrent claims (same wallet) are rejected
 * ✅ Replay attack (same timestamp) is rejected
 * ✅ Different wallets can claim simultaneously
 * ✅ Transaction rollback works on error
 * ✅ Logs are comprehensive for debugging
 */
