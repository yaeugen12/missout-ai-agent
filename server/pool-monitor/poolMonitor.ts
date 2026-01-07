import { db } from "../db";
import { pools, transactions } from "@shared/schema";
import { eq, not, inArray } from "drizzle-orm";
import { storage } from "../storage";
import {
  fetchPoolStateOnChain,
  unlockPoolOnChain,
  requestRandomnessOnChain,
  revealRandomnessOnChain,
  selectWinnerOnChain,
  payoutWinnerOnChain,
} from "./solanaServices";

const POLL_INTERVAL = 5000;
const MAX_RETRIES = 3;

const log = (...args: any[]) => console.log("[PoolMonitor]", ...args);
const sep = () => console.log("─".repeat(50));

const processingPools = new Set<number>();
const retryCount = new Map<string, number>();

export class PoolMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  start() {
    if (this.isRunning) {
      log("Monitor already running");
      return;
    }

    this.isRunning = true;
    log("Starting pool monitor...");

    this.intervalId = setInterval(() => this.tick(), POLL_INTERVAL);
    this.tick();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    log("Pool monitor stopped");
  }

  private async tick() {
    try {
      const activePools = await db
        .select()
        .from(pools)
        .where(
          not(
            inArray(pools.status, ["ended", "cancelled"])
          )
        );

      for (const pool of activePools) {
        if (!processingPools.has(pool.id)) {
          this.processPool(pool.id).catch(err => {
            log(`Error processing pool ${pool.id}:`, err.message);
            this.handleRetry(pool.id, "process");
            processingPools.delete(pool.id);
          });
        }
      }
    } catch (err) {
      log("Tick error:", err);
    }
  }

  private handleRetry(poolId: number, action: string) {
    const key = `${poolId}:${action}`;
    const count = (retryCount.get(key) ?? 0) + 1;
    retryCount.set(key, count);

    if (count >= MAX_RETRIES) {
      log(`Pool ${poolId} action ${action} failed ${count} times, will retry next tick`);
      retryCount.delete(key);
    }
  }

  private async processPool(poolId: number) {
    processingPools.add(poolId);

    try {
      sep();
      log(`Processing pool: ${poolId}`);

      const [pool] = await db.select().from(pools).where(eq(pools.id, poolId));
      if (!pool) {
        log(`Pool ${poolId} not found in database`);
        return;
      }

      if (!pool.poolAddress) {
        log(`Pool ${poolId} has no poolAddress, skipping`);
        return;
      }

      // CRITICAL: Fetch ON-CHAIN state as source of truth
      let onChainState: any;
      try {
        onChainState = await fetchPoolStateOnChain(pool.poolAddress);
      } catch (err: any) {
        log(`Pool ${poolId} ❌ Failed to fetch on-chain state: ${err.message}`);
        this.handleRetry(poolId, "fetch-state");
        return;
      }

      // Sync database state with on-chain state
      const onChainStatus = this.convertOnChainStatus(onChainState.status);
      if (onChainStatus && onChainStatus !== pool.status) {
        log(`Pool ${poolId} DB state mismatch: DB=${pool.status}, Chain=${onChainStatus}`);
        await db.update(pools)
          .set({ status: onChainStatus })
          .where(eq(pools.id, poolId));
        log(`Pool ${poolId} DB state synced to: ${onChainStatus}`);
      }

      // STATE MACHINE: Act based on ON-CHAIN state
      const status = onChainState.status;
      const statusStr = this.getStatusString(status);
      log(`Pool ${poolId} on-chain state: ${statusStr}`);

      // Real Pool status enum from IDL:
      // Open | Locked | Unlocked | RandomnessCommitted | RandomnessRevealed | WinnerSelected | Ended | Cancelled | Closed

      if (status.open !== undefined) {
        await this.handleOpen(pool, onChainState);
      } else if (status.locked !== undefined) {
        await this.handleLocked(pool, onChainState);
      } else if (status.unlocked !== undefined) {
        await this.handleUnlocked(pool, onChainState);
      } else if (status.randomnessCommitted !== undefined) {
        await this.handleRandomnessCommitted(pool, onChainState);
      } else if (status.randomnessRevealed !== undefined) {
        await this.handleRandomnessRevealed(pool, onChainState);
      } else if (status.winnerSelected !== undefined) {
        await this.handleWinnerSelected(pool, onChainState);
      } else if (status.ended !== undefined) {
        log(`Pool ${poolId} is Ended, no action needed`);
      } else if (status.cancelled !== undefined) {
        log(`Pool ${poolId} is Cancelled, no action needed`);
      } else if (status.closed !== undefined) {
        log(`Pool ${poolId} is Closed, no action needed`);
      } else {
        log(`Pool ${poolId} unknown on-chain status: ${JSON.stringify(status)}`);
      }
    } finally {
      processingPools.delete(poolId);
    }
  }

  /**
   * Convert on-chain status enum to database status string
   */
  private convertOnChainStatus(status: any): string | null {
    if (status.open !== undefined) return "open";
    if (status.locked !== undefined) return "locked";
    if (status.unlocked !== undefined) return "unlocking";
    if (status.randomnessCommitted !== undefined) return "randomness";
    if (status.randomnessRevealed !== undefined) return "randomness";
    if (status.winnerSelected !== undefined) return "winnerSelected";
    if (status.ended !== undefined) return "ended";
    if (status.cancelled !== undefined) return "cancelled";
    if (status.closed !== undefined) return "closed";
    return null;
  }

  /**
   * Get status as string
   */
  private getStatusString(status: any): string {
    if (status.open !== undefined) return "Open";
    if (status.locked !== undefined) return "Locked";
    if (status.unlocked !== undefined) return "Unlocked";
    if (status.randomnessCommitted !== undefined) return "RandomnessCommitted";
    if (status.randomnessRevealed !== undefined) return "RandomnessRevealed";
    if (status.winnerSelected !== undefined) return "WinnerSelected";
    if (status.ended !== undefined) return "Ended";
    if (status.cancelled !== undefined) return "Cancelled";
    if (status.closed !== undefined) return "Closed";
    return "Unknown";
  }

  /**
   * OPEN state: Pool is accepting participants
   * Action: Monitor only (smart contract locks when full)
   */
  private async handleOpen(pool: typeof pools.$inferSelect, onChainState: any) {
    log(`Pool ${pool.id} state=Open reason=MONITORING`);
    // Smart contract automatically locks when full, no backend action needed
  }

  /**
   * LOCKED state: Pool is full, waiting for lock duration to expire
   * Action: Check if lock duration expired, then call unlockPool()
   */
  private async handleLocked(pool: typeof pools.$inferSelect, onChainState: any) {
    const now = Math.floor(Date.now() / 1000);
    const lockStartTime = onChainState.lockStartTime?.toNumber() || 0;
    const lockDuration = onChainState.lockDuration?.toNumber() || 0;
    const unlockAt = lockStartTime + lockDuration;

    log(`Pool ${pool.id} state=Locked now=${now} unlockAt=${unlockAt} remaining=${Math.max(0, unlockAt - now)}s`);

    if (now >= unlockAt) {
      log(`Pool ${pool.id} lock period ended, calling unlockPool()...`);

      try {
        await unlockPoolOnChain(pool.poolAddress!);
        log(`Pool ${pool.id} ✅ unlockPool() succeeded`);
      } catch (err: any) {
        log(`Pool ${pool.id} ❌ unlockPool() failed: ${err.message}`);
        this.handleRetry(pool.id, "unlock");
      }
    } else {
      log(`Pool ${pool.id} still locked, waiting ${unlockAt - now}s`);
    }
  }

  /**
   * UNLOCKED state: Pool is unlocked, ready for randomness request
   * Action: Call requestRandomness()
   */
  private async handleUnlocked(pool: typeof pools.$inferSelect, onChainState: any) {
    log(`Pool ${pool.id} state=Unlocked, calling requestRandomness()...`);

    try {
      await requestRandomnessOnChain(pool.poolAddress!);
      log(`Pool ${pool.id} ✅ requestRandomness() succeeded`);
    } catch (err: any) {
      log(`Pool ${pool.id} ❌ requestRandomness() failed: ${err.message}`);
      this.handleRetry(pool.id, "randomness");
    }
  }

  /**
   * RANDOMNESS_COMMITTED state: Randomness has been committed
   * Action: Call revealRandomness() then selectWinner()
   * Note: select_winner instruction internally handles RandomnessCommitted → RandomnessRevealed → WinnerSelected
   */
  private async handleRandomnessCommitted(pool: typeof pools.$inferSelect, onChainState: any) {
    log(`Pool ${pool.id} state=RandomnessCommitted, calling revealRandomness()...`);

    try {
      await revealRandomnessOnChain(pool.poolAddress!);
      log(`Pool ${pool.id} ✅ revealRandomness() succeeded`);

      // Now call selectWinner which will:
      // 1. Verify randomness is revealed
      // 2. Update status to RandomnessRevealed
      // 3. Select winner using randomness
      // 4. Update status to WinnerSelected
      log(`Pool ${pool.id} calling selectWinner()...`);
      await selectWinnerOnChain(pool.poolAddress!);
      log(`Pool ${pool.id} ✅ selectWinner() succeeded`);
    } catch (err: any) {
      log(`Pool ${pool.id} ❌ randomness/selectWinner failed: ${err.message}`);
      this.handleRetry(pool.id, "revealAndSelect");
    }
  }

  /**
   * RANDOMNESS_REVEALED state: Randomness is ready, need to select winner
   * Action: Call selectWinner()
   */
  private async handleRandomnessRevealed(pool: typeof pools.$inferSelect, onChainState: any) {
    log(`Pool ${pool.id} state=RandomnessRevealed, calling selectWinner()...`);

    try {
      await selectWinnerOnChain(pool.poolAddress!);
      log(`Pool ${pool.id} ✅ selectWinner() succeeded`);
    } catch (err: any) {
      log(`Pool ${pool.id} ❌ selectWinner() failed: ${err.message}`);
      this.handleRetry(pool.id, "selectWinner");
    }
  }

  /**
   * WINNER_SELECTED state: Winner has been selected on-chain, need to payout
   * Action: Call payoutWinner()
   */
  private async handleWinnerSelected(pool: typeof pools.$inferSelect, onChainState: any) {
    log(`Pool ${pool.id} state=WinnerSelected, calling payoutWinner()...`);

    // Extract winner from on-chain state
    const winnerPubkey = onChainState.winner?.toBase58();

    if (!winnerPubkey) {
      log(`Pool ${pool.id} ❌ No winner found in on-chain state`);
      return;
    }

    try {
      await payoutWinnerOnChain(pool.poolAddress!);
      log(`Pool ${pool.id} ✅ payoutWinner() succeeded, winner=${winnerPubkey.slice(0, 16)}`);

      // Record PAYOUT transaction in database
      try {
        await db.insert(transactions).values({
          poolId: pool.id,
          walletAddress: winnerPubkey,
          type: 'PAYOUT',
          amount: (pool.totalPot || 0) * 0.90, // 90% payout as defined in IDL/UI
          txHash: null, // We don't have the payout txHash easily here
        });
      } catch (txErr) {
        log(`Pool ${pool.id} ⚠️ Failed to record payout transaction:`, txErr);
      }

      // Sync DB state
      await db.update(pools)
        .set({
          status: "ended",
          winnerWallet: winnerPubkey,
          endTime: new Date()
        })
        .where(eq(pools.id, pool.id));

      // REFERRAL REWARDS: Allocate 1.5% treasury fee among referrers
      try {
        if (pool.tokenMint && pool.totalPot) {
          const TREASURY_FEE_BPS = 150; // 1.5% as basis points
          const treasuryFeeAmount = Math.floor((pool.totalPot * TREASURY_FEE_BPS) / 10000);
          
          // Convert to token units (assuming tokenMint has decimals)
          // For now, store as raw amount string (backend will handle proper decimal conversion)
          const feeAmountStr = treasuryFeeAmount.toString();
          
          log(`Pool ${pool.id} 💰 Allocating referral rewards: ${feeAmountStr} (1.5% of ${pool.totalPot})`);
          await storage.allocateReferralRewards(pool.id, pool.tokenMint, feeAmountStr);
          log(`Pool ${pool.id} ✅ Referral rewards allocated`);
        }
      } catch (refErr: any) {
        log(`Pool ${pool.id} ⚠️ Failed to allocate referral rewards: ${refErr.message}`);
      }
    } catch (err: any) {
      log(`Pool ${pool.id} ❌ payoutWinner() failed: ${err.message}`);
      this.handleRetry(pool.id, "payout");
    }
  }

  getStatus() {
    return {
      running: this.isRunning,
      processingCount: processingPools.size,
      processingPools: Array.from(processingPools),
      retries: Object.fromEntries(retryCount)
    };
  }
}

export const poolMonitor = new PoolMonitor();
