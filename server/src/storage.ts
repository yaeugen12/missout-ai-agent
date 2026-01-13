import { db } from "./db.js";
import {
  pools, participants, transactions, profiles,
  referralRelations, referralRewards, referralRewardEvents, referralClaims,
  type Pool, type InsertPool, type Participant, type InsertParticipant,
  type Transaction, type InsertTransaction, type Profile,
  type ReferralRelation, type ReferralReward, type ReferralRewardEvent, type ReferralClaim
} from "@shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { randomBytes } from "crypto";

export interface IStorage {
  // Pools
  getPools(limit?: number, offset?: number): Promise<{ pools: Pool[]; total: number }>;
  getPool(id: number): Promise<Pool | undefined>;
  getPoolByAddress(poolAddress: string): Promise<Pool | undefined>;
  getPoolByTxHash(txHash: string): Promise<Pool | undefined>;
  createPool(pool: InsertPool): Promise<Pool>;
  updatePoolStatus(id: number, status: string, winner?: string): Promise<Pool>;
  
  // Participants
  getParticipants(poolId: number): Promise<Participant[]>;
  addParticipant(participant: InsertParticipant): Promise<Participant>;
  markRefundClaimed(poolId: number, wallet: string): Promise<boolean>;
  markRentClaimed(poolId: number): Promise<boolean>;

  // Claimable pools (optimized single query)
  getClaimablePools(wallet: string): Promise<{
    refunds: Array<Pool & { participants: Participant[] }>;
    rents: Pool[];
  }>;

  // Transactions
  addTransaction(transaction: InsertTransaction): Promise<Transaction>;
  getPoolTransactions(poolId: number): Promise<Transaction[]>;
  
  // Leaderboard (Mock stats)
  getLeaderboard(): Promise<{
    topWinners: { wallet: string; totalWon: number }[];
    topReferrers: { wallet: string; referrals: number }[];
  }>;

  // New detailed leaderboard endpoints
  getTopWinners(limit?: number, offset?: number): Promise<{
    winners: Array<{
      wallet: string;
      winsCount: number;
      totalTokensWon: number;
      totalUsdWon: number;
      biggestWinTokens: number;
      biggestWinUsd: number;
      lastWinAt: Date | null;
      tokenMint: string | null;
      tokenSymbol: string | null;
    }>;
    total: number;
  }>;

  getTopReferrers(limit?: number, offset?: number): Promise<{
    referrers: Array<{
      wallet: string;
      referralsCount: number;
      totalTokensEarned: number;
      totalUsdEarned: number;
      activeReferrals: number;
      firstReferralAt: Date | null;
      lastReferralAt: Date | null;
    }>;
    total: number;
  }>;

  // Profiles
  getProfile(walletAddress: string): Promise<Profile | undefined>;
  getOrCreateNonce(walletAddress: string): Promise<string>;
  updateProfile(walletAddress: string, data: { nickname?: string; avatarUrl?: string; avatarStyle?: string }): Promise<Profile>;
  isNicknameAvailable(nickname: string, excludeWallet?: string): Promise<boolean>;
  checkNicknameCooldown(walletAddress: string): Promise<{ canChange: boolean; cooldownEnds?: Date }>;
}

export class DatabaseStorage implements IStorage {
  async getPools(limit?: number, offset?: number): Promise<{ pools: Pool[]; total: number }> {
    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pools);

    // Get paginated results
    const query = db.select().from(pools).orderBy(desc(pools.startTime));

    // Apply pagination if specified
    const poolsList = await (limit !== undefined && offset !== undefined
      ? query.limit(limit).offset(offset)
      : limit !== undefined
        ? query.limit(limit)
        : query);

    return { pools: poolsList, total: count };
  }

  async getPool(id: number): Promise<Pool | undefined> {
    const [pool] = await db.select().from(pools).where(eq(pools.id, id));
    return pool;
  }

  async getPoolByAddress(poolAddress: string): Promise<Pool | undefined> {
    const [pool] = await db.select().from(pools).where(eq(pools.poolAddress, poolAddress));
    return pool;
  }

  async getPoolByTxHash(txHash: string): Promise<Pool | undefined> {
    const [pool] = await db.select().from(pools).where(eq(pools.txHash, txHash));
    return pool;
  }

  async createPool(insertPool: InsertPool): Promise<Pool> {
    console.log("[STORAGE] createPool called with allowMock:", insertPool.allowMock);
    const [pool] = await db.insert(pools).values({
      ...insertPool,
      participantsCount: 0,
      status: 'open',
      totalPot: 0,
      allowMock: insertPool.allowMock ?? 0,
    }).returning();
    console.log("[STORAGE] Pool created with allowMock:", pool.allowMock);
    return pool;
  }

  async updatePoolStatus(id: number, status: string, winner?: string): Promise<Pool> {
    // Normalize status to lowercase
    const normalizedStatus = status.toLowerCase();
    const [updated] = await db.update(pools)
      .set({ 
        status: normalizedStatus, 
        winnerWallet: winner,
        endTime: normalizedStatus === 'ended' ? new Date() : undefined,
        lockTime: normalizedStatus === 'locked' ? new Date() : undefined
      })
      .where(eq(pools.id, id))
      .returning();
    return updated;
  }

  async getParticipants(poolId: number): Promise<Participant[]> {
    return await db.select().from(participants).where(eq(participants.poolId, poolId));
  }

  /**
   * OPTIMIZED: Get participants with profiles using single JOIN query
   * Fixes N+1 query problem - previously called getProfile() for each participant
   */
  async getParticipantsWithProfiles(poolId: number): Promise<Array<Participant & { displayName?: string; displayAvatar?: string }>> {
    const generateDicebearAvatar = (wallet: string, style: string = "bottts") =>
      `https://api.dicebear.com/7.x/${style}/svg?seed=${wallet}`;

    // OPTIMIZED: Single query with LEFT JOIN - 1 query instead of N+1
    const results = await db
      .select({
        participant: participants,
        profile: profiles
      })
      .from(participants)
      .leftJoin(profiles, eq(profiles.walletAddress, participants.walletAddress))
      .where(eq(participants.poolId, poolId));

    // Map results and enrich with display data
    const enrichedParticipants = results.map(({ participant, profile }) => ({
      ...participant,
      displayName: profile?.nickname || undefined,
      displayAvatar: profile?.avatarUrl || generateDicebearAvatar(participant.walletAddress, profile?.avatarStyle || "bottts"),
    }));

    return enrichedParticipants;
  }

  async addParticipant(participant: InsertParticipant): Promise<Participant> {
    // Transaction to add participant and update pool count/pot
    return await db.transaction(async (tx) => {
      // SECURITY: Check for duplicate participant BEFORE inserting
      const existingParticipant = await tx.query.participants.findFirst({
        where: and(
          eq(participants.poolId, participant.poolId),
          eq(participants.walletAddress, participant.walletAddress)
        )
      });
      
      if (existingParticipant) {
        throw new Error("DUPLICATE_PARTICIPANT: Wallet already joined this pool");
      }
      
      const [newParticipant] = await tx.insert(participants).values(participant).returning();
      
      const pool = await tx.query.pools.findFirst({
        where: eq(pools.id, participant.poolId)
      });
      
      if (pool) {
        const newCount = (pool.participantsCount || 0) + 1;
        const isFull = newCount >= pool.maxParticipants;
        
        await tx.update(pools)
          .set({ 
            participantsCount: newCount,
            totalPot: (pool.totalPot || 0) + pool.entryAmount,
            // Set lockStartTime ONLY when pool becomes full
            ...(isFull && !pool.lockStartTime ? { 
              lockStartTime: Math.floor(Date.now() / 1000),
              status: 'locked',
              lockTime: new Date()
            } : {})
          })
          .where(eq(pools.id, participant.poolId));
      }
      
      return newParticipant;
    });
  }

  /**
   * Mark refund as claimed - ATOMIC UPDATE
   *
   * Uses WHERE clause with refundClaimed = 0 to prevent race conditions.
   * If the update affects 0 rows, it means:
   * - Participant doesn't exist OR
   * - Refund was already claimed
   *
   * @returns true if refund was successfully marked as claimed, false if already claimed
   */
  async markRefundClaimed(poolId: number, wallet: string): Promise<boolean> {
    const result = await db.update(participants)
      .set({ refundClaimed: 1 })
      .where(and(
        eq(participants.poolId, poolId),
        eq(participants.walletAddress, wallet),
        eq(participants.refundClaimed, 0) // ATOMIC: Only update if not already claimed
      ))
      .returning();

    return result.length > 0;
  }

  /**
   * Mark rent as claimed - ATOMIC UPDATE
   *
   * Uses WHERE clause with rentClaimed = 0 to prevent race conditions.
   * If the update affects 0 rows, it means:
   * - Pool doesn't exist OR
   * - Rent was already claimed
   *
   * @returns true if rent was successfully marked as claimed, false if already claimed
   */
  async markRentClaimed(poolId: number): Promise<boolean> {
    const result = await db.update(pools)
      .set({ rentClaimed: 1 })
      .where(and(
        eq(pools.id, poolId),
        eq(pools.rentClaimed, 0) // ATOMIC: Only update if not already claimed
      ))
      .returning();

    return result.length > 0;
  }

  /**
   * OPTIMIZED: Get claimable pools for a wallet in a single query
   * Fixes N+1 query problem - previously looped through all pools calling getParticipants()
   * Now uses JOINs to fetch everything in 2 queries total
   */
  async getClaimablePools(wallet: string): Promise<{
    refunds: Array<Pool & { participants: Participant[] }>;
    rents: Pool[];
  }> {
    // Query 1: Get cancelled pools where user can claim refund
    // Uses JOIN to get pool + participant data in one query
    // Query potential refund pools from database
    const refundResults = await db
      .select({
        pool: pools,
        participant: participants
      })
      .from(pools)
      .innerJoin(participants, eq(participants.poolId, pools.id))
      .where(
        and(
          eq(pools.status, 'cancelled'),
          eq(participants.walletAddress, wallet),
          eq(participants.refundClaimed, 0)
        )
      );

    // REFACTORED: Filter based on on-chain participants list
    // Only return pools where wallet is ACTUALLY in the on-chain participants list
    const { isWalletInParticipantsList } = await import("./pool-monitor/solanaServices.js");

    const refundPoolsMap = new Map<number, Pool & { participants: Participant[] }>();

    for (const row of refundResults) {
      try {
        // Verify wallet is in on-chain participants list
        const isParticipant = await isWalletInParticipantsList(row.pool.poolAddress, wallet);

        if (isParticipant) {
          if (!refundPoolsMap.has(row.pool.id)) {
            refundPoolsMap.set(row.pool.id, {
              ...row.pool,
              participants: []
            });
          }
          refundPoolsMap.get(row.pool.id)!.participants.push(row.participant);
        } else {
          console.log(`[getClaimablePools] Skipping pool ${row.pool.poolAddress.slice(0, 8)} - wallet not in on-chain participants list (likely already claimed)`);

          // Database sync: Mark as claimed if not in on-chain list
          // This prevents repeated checks for already-claimed refunds
          try {
            await db
              .update(participants)
              .set({ refundClaimed: 1 })
              .where(eq(participants.id, row.participant.id));
            console.log(`[getClaimablePools] Marked participant ${row.participant.id} refund as claimed (DB sync)`);
          } catch (dbErr) {
            console.error(`[getClaimablePools] Failed to update participant ${row.participant.id}:`, dbErr);
          }
        }
      } catch (err) {
        console.error(`[getClaimablePools] Error checking on-chain participants for pool ${row.pool.poolAddress.slice(0, 8)}:`, err);
      }
    }

    const refunds = Array.from(refundPoolsMap.values());

    // Query 2: Get pools where user is creator and can claim rent
    // REFACTORED: Now checks on-chain state instead of status field
    const { isPoolEmptyForRentClaim } = await import("./pool-monitor/solanaServices.js");

    const potentialRentPools = await db
      .select()
      .from(pools)
      .where(
        and(
          eq(pools.creatorWallet, wallet),
          eq(pools.rentClaimed, 0)
        )
      );

    // Filter pools based on on-chain state: pool_token.amount == 0 AND participants.count == 0
    const rents: Pool[] = [];
    for (const pool of potentialRentPools) {
      try {
        const isEmpty = await isPoolEmptyForRentClaim(pool.poolAddress);
        if (isEmpty) {
          rents.push(pool);
        }
      } catch (err) {
        console.error(`[getClaimablePools] Error checking pool ${pool.poolAddress.slice(0, 8)}:`, err);
      }
    }

    return { refunds, rents };
  }

  async addTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [newTx] = await db.insert(transactions).values(transaction).returning();
    
    // If donation, update pot and donatedAmount
    if (transaction.type === 'DONATE') {
      const pool = await db.query.pools.findFirst({
        where: eq(pools.id, transaction.poolId)
      });
      if (pool) {
        await db.update(pools)
          .set({ 
            totalPot: (pool.totalPot || 0) + transaction.amount,
            donatedAmount: (pool.donatedAmount || 0) + transaction.amount
          })
          .where(eq(pools.id, transaction.poolId));
      }
    }
    
    return newTx;
  }

  async getPoolTransactions(poolId: number): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.poolId, poolId));
  }

  async getWalletTransactions(walletAddress: string) {
    return await db.transaction(async (tx) => {
      const results = await tx.select({
        id: transactions.id,
        poolId: transactions.id,
        walletAddress: transactions.walletAddress,
        type: transactions.type,
        amount: transactions.amount,
        txHash: transactions.txHash,
        timestamp: transactions.timestamp,
        pool: {
          tokenSymbol: pools.tokenSymbol
        }
      })
      .from(transactions)
      .innerJoin(pools, eq(transactions.poolId, pools.id))
      .where(eq(transactions.walletAddress, walletAddress))
      .orderBy(desc(transactions.timestamp));
      
      return results;
    });
  }

  async getLeaderboard() {
    // Use real data from new methods
    const { winners: topWinners } = await this.getTopWinners(10, 0);
    const { referrers: topReferrers } = await this.getTopReferrers(10, 0);

    return {
      topWinners: topWinners.map(w => ({ wallet: w.wallet, totalWon: w.totalTokensWon })),
      topReferrers: topReferrers.map(r => ({ wallet: r.wallet, referrals: r.referralsCount }))
    };
  }

  async getTopWinners(limit: number = 20, offset: number = 0) {
    // SECURITY FIX: Validate and sanitize inputs to prevent SQL injection
    const safeLimit = Math.min(Math.max(parseInt(String(limit)), 1), 100);
    const safeOffset = Math.max(parseInt(String(offset)), 0);

    // Get total count of winners
    const countResult = await db.execute(sql`
      SELECT COUNT(DISTINCT winner_wallet)::int as total
      FROM pools
      WHERE winner_wallet IS NOT NULL AND status = 'ended'
    `);
    const total = (countResult.rows[0] as any)?.total || 0;

    // Query pools with winners, aggregate by wallet
    // Using sql.raw() with validated integers to safely inject LIMIT/OFFSET
    const result = await db.execute(sql`
      SELECT
        winner_wallet as wallet,
        COUNT(*)::int as wins_count,
        COALESCE(SUM(total_pot), 0)::float as total_tokens_won,
        COALESCE(MAX(total_pot), 0)::float as biggest_win_tokens,
        MAX(end_time) as last_win_at,
        token_mint,
        token_symbol
      FROM pools
      WHERE winner_wallet IS NOT NULL
        AND status = 'ended'
      GROUP BY winner_wallet, token_mint, token_symbol
      ORDER BY total_tokens_won DESC
      LIMIT ${sql.raw(String(safeLimit))}
      OFFSET ${sql.raw(String(safeOffset))}
    `);

    const winners = (result.rows as any[]).map(row => ({
      wallet: row.wallet as string,
      winsCount: row.wins_count as number,
      totalTokensWon: row.total_tokens_won as number,
      totalUsdWon: 0, // Would need price API integration
      biggestWinTokens: row.biggest_win_tokens as number,
      biggestWinUsd: 0, // Would need price API integration
      lastWinAt: row.last_win_at as Date | null,
      tokenMint: row.token_mint as string | null,
      tokenSymbol: row.token_symbol as string | null,
    }));

    return { winners, total };
  }

  async getTopReferrers(limit: number = 20, offset: number = 0) {
    // SECURITY FIX: Validate and sanitize inputs to prevent SQL injection
    const safeLimit = Math.min(Math.max(parseInt(String(limit)), 1), 100);
    const safeOffset = Math.max(parseInt(String(offset)), 0);

    // Get total count of referrers
    const countResult = await db.execute(sql`
      SELECT COUNT(DISTINCT referrer_wallet)::int as total
      FROM referral_relations
    `);
    const total = (countResult.rows[0] as any)?.total || 0;

    // Query referral_relations and referral_rewards
    // Using sql.raw() with validated integers to safely inject LIMIT/OFFSET
    const result = await db.execute(sql`
      SELECT
        rr.referrer_wallet as wallet,
        COUNT(DISTINCT rr.referred_wallet)::int as referrals_count,
        COALESCE(SUM(
          (COALESCE(rew.amount_pending, '0')::numeric + COALESCE(rew.amount_claimed, '0')::numeric) / 1e9
        ), 0)::float as total_tokens_earned,
        MIN(rr.created_at) as first_referral_at,
        MAX(rr.created_at) as last_referral_at
      FROM referral_relations rr
      LEFT JOIN referral_rewards rew ON rr.referrer_wallet = rew.referrer_wallet
      GROUP BY rr.referrer_wallet
      ORDER BY referrals_count DESC
      LIMIT ${sql.raw(String(safeLimit))}
      OFFSET ${sql.raw(String(safeOffset))}
    `);

    const referrers = (result.rows as any[]).map(row => ({
      wallet: row.wallet as string,
      referralsCount: row.referrals_count as number,
      totalTokensEarned: row.total_tokens_earned as number,
      totalUsdEarned: 0, // Would need price API integration
      activeReferrals: 0, // Could be computed with additional query
      firstReferralAt: row.first_referral_at as Date | null,
      lastReferralAt: row.last_referral_at as Date | null,
    }));

    return { referrers, total };
  }

  // Profile methods
  async getProfile(walletAddress: string): Promise<Profile | undefined> {
    const [profile] = await db.select().from(profiles).where(eq(profiles.walletAddress, walletAddress));
    return profile;
  }

  async getOrCreateNonce(walletAddress: string): Promise<string> {
    const nonce = randomBytes(32).toString("hex");
    
    const existing = await this.getProfile(walletAddress);
    
    if (existing) {
      await db.update(profiles)
        .set({ nonce, updatedAt: new Date() })
        .where(eq(profiles.walletAddress, walletAddress));
    } else {
      await db.insert(profiles).values({
        walletAddress,
        nonce,
        avatarStyle: "bottts"
      });
    }
    
    return nonce;
  }

  async updateProfile(walletAddress: string, data: { nickname?: string; avatarUrl?: string; avatarStyle?: string }): Promise<Profile> {
    const existing = await this.getProfile(walletAddress);
    const updateData: any = {
      ...data,
      updatedAt: new Date(),
      nonce: null
    };
    
    if (data.nickname !== undefined && data.nickname !== existing?.nickname) {
      updateData.lastNicknameChange = new Date();
      updateData.nicknameChangeCount = (existing?.nicknameChangeCount || 0) + 1;
    }
    
    if (existing) {
      const [updated] = await db.update(profiles)
        .set(updateData)
        .where(eq(profiles.walletAddress, walletAddress))
        .returning();
      return updated;
    } else {
      const [inserted] = await db.insert(profiles).values({
        walletAddress,
        ...updateData,
        nicknameChangeCount: data.nickname !== undefined ? 1 : 0
      } as any).returning();
      return inserted;
    }
  }

  async isNicknameAvailable(nickname: string, excludeWallet?: string): Promise<boolean> {
    const existing = await db.select().from(profiles).where(eq(profiles.nickname, nickname));
    
    if (existing.length === 0) return true;
    if (excludeWallet && existing[0].walletAddress === excludeWallet) return true;
    
    return false;
  }

  async checkNicknameCooldown(walletAddress: string): Promise<{ canChange: boolean; cooldownEnds?: Date }> {
    const profile = await this.getProfile(walletAddress);
    
    if (!profile || !profile.lastNicknameChange || (profile.nicknameChangeCount || 0) < 2) {
      return { canChange: true };
    }
    
    const cooldownMs = 48 * 60 * 60 * 1000; // 48 hours
    const cooldownEnds = new Date(profile.lastNicknameChange.getTime() + cooldownMs);
    const now = new Date();
    
    if (now >= cooldownEnds) {
      return { canChange: true };
    }
    
    return { canChange: false, cooldownEnds };
  }

  // ============================================
  // REFERRAL SYSTEM METHODS
  // ============================================

  async getReferralRelation(referredWallet: string): Promise<ReferralRelation | undefined> {
    const [relation] = await db.select().from(referralRelations).where(eq(referralRelations.referredWallet, referredWallet));
    return relation;
  }

  async createReferralRelation(referredWallet: string, referrerWallet: string, source: string = 'link'): Promise<ReferralRelation | null> {
    if (referredWallet === referrerWallet) {
      console.log("[Referral] Rejected self-referral:", referredWallet);
      return null;
    }

    const existing = await this.getReferralRelation(referredWallet);
    if (existing) {
      console.log("[Referral] Wallet already has referrer:", referredWallet);
      return null;
    }

    try {
      const [relation] = await db.insert(referralRelations).values({
        referredWallet,
        referrerWallet,
        source
      }).returning();
      console.log("[Referral] Created relation:", referredWallet, "->", referrerWallet);
      return relation;
    } catch (err) {
      console.error("[Referral] Failed to create relation:", err);
      return null;
    }
  }

  async getReferralStats(referrerWallet: string): Promise<{
    totalInvited: number;
    totalEarned: string;
    totalClaimed: string;
  }> {
    const invited = await db.select().from(referralRelations).where(eq(referralRelations.referrerWallet, referrerWallet));

    const rewards = await db.select().from(referralRewards).where(eq(referralRewards.referrerWallet, referrerWallet));

    const totalEarned = rewards.reduce((sum, r) => sum + BigInt(r.amountPending || "0") + BigInt(r.amountClaimed || "0"), BigInt(0));
    const totalClaimed = rewards.reduce((sum, r) => sum + BigInt(r.amountClaimed || "0"), BigInt(0));

    return {
      totalInvited: invited.length,
      totalEarned: totalEarned.toString(),
      totalClaimed: totalClaimed.toString()
    };
  }

  async getReferralRewards(referrerWallet: string): Promise<ReferralReward[]> {
    return await db.select().from(referralRewards).where(eq(referralRewards.referrerWallet, referrerWallet));
  }

  async getInvitedUsers(referrerWallet: string): Promise<ReferralRelation[]> {
    return await db.select().from(referralRelations).where(eq(referralRelations.referrerWallet, referrerWallet)).orderBy(desc(referralRelations.createdAt));
  }

  async allocateReferralRewards(poolId: number, tokenMint: string, totalFeeAmount: string): Promise<void> {
    const existingEvents = await db.select().from(referralRewardEvents)
      .where(and(eq(referralRewardEvents.poolId, poolId), eq(referralRewardEvents.tokenMint, tokenMint)));
    
    if (existingEvents.length > 0) {
      console.log("[Referral] Rewards already allocated for pool:", poolId);
      return;
    }

    const poolParticipants = await this.getParticipants(poolId);
    
    const referrerSet = new Set<string>();
    for (const p of poolParticipants) {
      const relation = await this.getReferralRelation(p.walletAddress);
      if (relation) {
        referrerSet.add(relation.referrerWallet);
      }
    }

    const referrers = Array.from(referrerSet);
    if (referrers.length === 0) {
      console.log("[Referral] No referrers for pool:", poolId, "- fee stays in treasury");
      return;
    }

    const totalFee = BigInt(totalFeeAmount);
    const sharePerReferrer = totalFee / BigInt(referrers.length);

    console.log("[Referral] Allocating", totalFeeAmount, "to", referrers.length, "referrers (", sharePerReferrer.toString(), "each)");

    for (const referrerWallet of referrers) {
      await db.insert(referralRewardEvents).values({
        poolId,
        tokenMint,
        referrerWallet,
        amount: sharePerReferrer.toString()
      });

      const [existingReward] = await db.select().from(referralRewards)
        .where(and(eq(referralRewards.referrerWallet, referrerWallet), eq(referralRewards.tokenMint, tokenMint)));

      if (existingReward) {
        const newPending = BigInt(existingReward.amountPending || "0") + sharePerReferrer;
        await db.update(referralRewards)
          .set({ amountPending: newPending.toString(), lastUpdated: new Date() })
          .where(eq(referralRewards.id, existingReward.id));
      } else {
        await db.insert(referralRewards).values({
          referrerWallet,
          tokenMint,
          amountPending: sharePerReferrer.toString(),
          amountClaimed: "0"
        });
      }
    }
  }

  async claimReferralReward(referrerWallet: string, tokenMint: string, claimTimestamp?: number): Promise<{ success: boolean; amount: string; error?: string }> {
    return await db.transaction(async (tx) => {
      // Use raw SQL with SELECT FOR UPDATE to lock the row atomically
      const lockQuery = claimTimestamp
        ? sql`
            SELECT * FROM referral_rewards 
            WHERE referrer_wallet = ${referrerWallet} 
              AND token_mint = ${tokenMint}
              AND CAST(amount_pending AS BIGINT) > 0
              AND (last_claim_timestamp IS NULL OR last_claim_timestamp < ${claimTimestamp})
            FOR UPDATE
          `
        : sql`
            SELECT * FROM referral_rewards 
            WHERE referrer_wallet = ${referrerWallet} 
              AND token_mint = ${tokenMint}
              AND CAST(amount_pending AS BIGINT) > 0
            FOR UPDATE
          `;

      const lockedRows = await tx.execute(lockQuery);
      const reward = lockedRows.rows[0] as any;

      if (!reward) {
        return { success: false, amount: "0", error: "No pending rewards to claim or signature already used" };
      }

      const amountToClaim = reward.amount_pending || "0";
      const newAmountClaimed = (BigInt(reward.amount_claimed || "0") + BigInt(amountToClaim)).toString();

      // Atomic update - only this transaction can proceed now
      await tx.update(referralRewards)
        .set({
          amountPending: "0",
          amountClaimed: newAmountClaimed,
          lastUpdated: new Date(),
          lastClaimTimestamp: claimTimestamp ?? null
        })
        .where(eq(referralRewards.id, reward.id));

      await tx.insert(referralClaims).values({
        referrerWallet,
        tokenMint,
        amount: amountToClaim,
        status: "pending"
      });

      return { success: true, amount: amountToClaim };
    });
  }

  async updateClaimStatus(claimId: number, status: string, txSignature?: string): Promise<void> {
    await db.update(referralClaims)
      .set({ status, txSignature })
      .where(eq(referralClaims.id, claimId));
  }

  async getPendingClaims(): Promise<ReferralClaim[]> {
    return await db.select().from(referralClaims).where(eq(referralClaims.status, "pending"));
  }

  async getLastClaimTimestamp(referrerWallet: string, tokenMint: string): Promise<number | null> {
    const [reward] = await db.select({ lastClaimTimestamp: referralRewards.lastClaimTimestamp })
      .from(referralRewards)
      .where(and(eq(referralRewards.referrerWallet, referrerWallet), eq(referralRewards.tokenMint, tokenMint)));
    return reward?.lastClaimTimestamp ?? null;
  }

  async setLastClaimTimestamp(referrerWallet: string, tokenMint: string, timestamp: number): Promise<void> {
    const [existing] = await db.select().from(referralRewards)
      .where(and(eq(referralRewards.referrerWallet, referrerWallet), eq(referralRewards.tokenMint, tokenMint)));
    
    if (existing) {
      await db.update(referralRewards)
        .set({ lastClaimTimestamp: timestamp })
        .where(eq(referralRewards.id, existing.id));
    }
  }
}

export const storage = new DatabaseStorage();
