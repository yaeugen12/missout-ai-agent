import { db } from "./db.js";
import {
  pools, participants, transactions, profiles, notifications, poolChatMessages,
  referralRelations, referralRewards, referralRewardEvents, referralClaims, winnersFeed,
  sponsoredParticipants,
  type Pool, type InsertPool, type Participant, type InsertParticipant,
  type Transaction, type InsertTransaction, type Profile, type Notification, type InsertNotification,
  type PoolChatMessage, type InsertPoolChatMessage,
  type ReferralRelation, type ReferralReward, type ReferralRewardEvent, type ReferralClaim,
  type WinnerFeedEntry, type InsertWinnerFeedEntry,
  type SponsoredParticipant, type InsertSponsoredParticipant
} from "@shared/schema";
import { eq, desc, sql, and, or, ilike } from "drizzle-orm";
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
      totalUsdBet: number;
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

  // Notifications
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotifications(walletAddress: string, limit?: number): Promise<Notification[]>;
  markNotificationAsRead(id: number, walletAddress: string): Promise<boolean>;
  markAllNotificationsAsRead(walletAddress: string): Promise<number>;
  deleteNotification(id: number, walletAddress: string): Promise<boolean>;
  deleteAllNotifications(walletAddress: string): Promise<number>;
  getUnreadCount(walletAddress: string): Promise<number>;

  // Pool Chat
  createChatMessage(message: InsertPoolChatMessage): Promise<PoolChatMessage>;
  getChatMessages(poolId: number, limit?: number): Promise<PoolChatMessage[]>;
  deletePoolChatMessages(poolId: number): Promise<number>;

  // Winners Feed
  createWinnerFeedEntry(entry: InsertWinnerFeedEntry): Promise<WinnerFeedEntry>;
  getRecentWinners(limit?: number): Promise<WinnerFeedEntry[]>;
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
    const [pool] = await db.insert(pools).values({
      ...insertPool,
      participantsCount: 0,
      status: 'open',
      totalPot: 0,
    }).returning();
    return pool;
  }

  async updatePoolStatus(id: number, status: string, winner?: string): Promise<Pool> {
    // Normalize status to lowercase
    const normalizedStatus = status.toLowerCase();
    // Normalize winner wallet to lowercase
    const normalizedWinner = winner ? winner.toLowerCase() : undefined;
    const [updated] = await db.update(pools)
      .set({
        status: normalizedStatus,
        winnerWallet: normalizedWinner,
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
   * 🆓 FREE POOLS: Resolves auxiliary wallets to real wallets for sponsored participants
   */
  async getParticipantsWithProfiles(poolId: number): Promise<Array<Participant & { displayName?: string; displayAvatar?: string }>> {
    const generateDicebearAvatar = (wallet: string, style: string = "bottts") =>
      `https://api.dicebear.com/7.x/${style}/svg?seed=${wallet}`;

    // Check if this is a FREE pool
    const pool = await this.getPool(poolId);
    const isFreePool = pool && (pool as any).isFree === 1;

    // Get sponsored participants mapping for FREE pools
    let sponsoredMap: Map<string, string> = new Map(); // auxiliary -> real
    if (isFreePool) {
      const sponsored = await this.getSponsoredParticipantsForPool(poolId);
      sponsored.forEach(sp => {
        sponsoredMap.set(sp.auxiliaryWallet.toLowerCase(), sp.realWallet.toLowerCase());
      });
    }

    // OPTIMIZED: Single query with LEFT JOIN - 1 query instead of N+1
    // Use case-insensitive matching for wallet addresses
    const results = await db
      .select({
        participant: participants,
        profile: profiles
      })
      .from(participants)
      .leftJoin(profiles, sql`LOWER(${profiles.walletAddress}) = LOWER(${participants.walletAddress})`)
      .where(eq(participants.poolId, poolId));

    // Map results and enrich with display data
    // 🆓 FREE POOLS: Replace auxiliary wallet with real wallet for sponsored participants
    const enrichedParticipants = await Promise.all(results.map(async ({ participant, profile }) => {
      let displayWallet = participant.walletAddress;
      let displayProfile = profile;

      // If FREE pool and participant is auxiliary wallet, resolve to real wallet
      if (isFreePool && sponsoredMap.has(participant.walletAddress.toLowerCase())) {
        const realWallet = sponsoredMap.get(participant.walletAddress.toLowerCase())!;
        displayWallet = realWallet;

        // Fetch profile for real wallet
        displayProfile = await this.getProfile(realWallet);
      }

      return {
        ...participant,
        walletAddress: displayWallet, // Show real wallet instead of auxiliary
        displayName: displayProfile?.nickname || undefined,
        displayAvatar: displayProfile?.avatarUrl || generateDicebearAvatar(displayWallet, displayProfile?.avatarStyle || "bottts"),
      };
    }));

    return enrichedParticipants;
  }

  async addParticipant(participant: InsertParticipant): Promise<Participant> {
    // Normalize wallet address to lowercase for consistency
    const normalizedParticipant = {
      ...participant,
      walletAddress: participant.walletAddress.toLowerCase()
    };

    // Transaction to add participant and update pool count/pot
    return await db.transaction(async (tx) => {
      // SECURITY: Check for duplicate participant BEFORE inserting
      const existingParticipant = await tx.query.participants.findFirst({
        where: and(
          eq(participants.poolId, normalizedParticipant.poolId),
          eq(participants.walletAddress, normalizedParticipant.walletAddress)
        )
      });

      if (existingParticipant) {
        throw new Error("DUPLICATE_PARTICIPANT: Wallet already joined this pool");
      }

      const [newParticipant] = await tx.insert(participants).values(normalizedParticipant).returning();
      
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
    const normalizedWallet = wallet.toLowerCase();
    const result = await db.update(participants)
      .set({ refundClaimed: 1 })
      .where(and(
        eq(participants.poolId, poolId),
        eq(participants.walletAddress, normalizedWallet),
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
    const normalizedWallet = wallet.trim().toLowerCase();

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
          ilike(participants.walletAddress, normalizedWallet),
          eq(participants.refundClaimed, 0)
        )
      );

    // REFACTORED: Filter based on on-chain participants list
    // Only return pools where wallet is ACTUALLY in the on-chain participants list
    const { isWalletInParticipantsList } = await import("./pool-monitor/solanaServices.js");

    const refundPoolsMap = new Map<number, Pool & { participants: Participant[] }>();

    for (const row of refundResults) {
      try {
        // FIXED: Always include pools from database that have status=cancelled and refundClaimed=0
        // The on-chain verification will happen when user actually tries to claim
        // Previously, we were auto-marking as claimed when on-chain check failed, which was incorrect
        
        // Still try on-chain verification for logging purposes, but don't auto-mark as claimed
        let isParticipantOnChain = false;
        try {
          isParticipantOnChain = await isWalletInParticipantsList(row.pool.poolAddress, normalizedWallet);
        } catch (onChainErr) {
          console.log(`[getClaimablePools] On-chain check failed for pool ${row.pool.poolAddress.slice(0, 8)} - including anyway: ${onChainErr}`);
        }

        // Include the pool regardless of on-chain status - let the claim attempt verify
        if (!refundPoolsMap.has(row.pool.id)) {
          refundPoolsMap.set(row.pool.id, {
            ...row.pool,
            participants: []
          });
        }
        refundPoolsMap.get(row.pool.id)!.participants.push(row.participant);

        // Log the verification result for debugging
        if (isParticipantOnChain) {
          console.log(`[getClaimablePools] Pool ${row.pool.poolAddress.slice(0, 8)} - wallet verified on-chain ✓`);
        } else {
          console.log(`[getClaimablePools] Pool ${row.pool.poolAddress.slice(0, 8)} - wallet NOT on-chain (may have already claimed, or account closed)`);
        }
      } catch (err) {
        console.error(`[getClaimablePools] Error processing pool ${row.pool.poolAddress.slice(0, 8)}:`, err);
        // Still include the pool even if there's an error - let claim attempt verify
        if (!refundPoolsMap.has(row.pool.id)) {
          refundPoolsMap.set(row.pool.id, {
            ...row.pool,
            participants: []
          });
        }
        refundPoolsMap.get(row.pool.id)!.participants.push(row.participant);
      }
    }

    const refunds = Array.from(refundPoolsMap.values());

    // Query 2: Get pools where user is creator and can claim rent
    // REFACTORED: Now checks on-chain state instead of status field
    const potentialRentPools = await db
      .select()
      .from(pools)
      .where(
        and(
          ilike(pools.creatorWallet, normalizedWallet),
          eq(pools.rentClaimed, 0)
        )
      );

    console.log(`[getClaimablePools] Found ${potentialRentPools.length} potential rent pools for ${normalizedWallet}`);
    potentialRentPools.forEach(p => {
      console.log(`[getClaimablePools] Pool ${p.id} status: ${p.status}, creator: ${p.creatorWallet}`);
    });

    // Filter pools based on on-chain state: pool_token.amount == 0 AND participants.count == 0
    const rents: Pool[] = [];
    for (const pool of potentialRentPools) {
      try {
        // Rents are only claimable for pools that are ENDED (successful) or CANCELLED (not enough participants)
        // Also ensure rent hasn't been claimed already (handled by potentialRentPools filter)
        if (pool.status === 'ended' || pool.status === 'cancelled') {
          rents.push(pool);
          console.log(`[getClaimablePools] Including eligible rent pool ${pool.id} (${pool.poolAddress.slice(0, 8)}) status: ${pool.status}`);
        }
      } catch (err) {
        console.error(`[getClaimablePools] Error checking pool ${pool.poolAddress.slice(0, 8)}:`, err);
      }
    }

    return { refunds, rents };
  }

  async addTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const normalizedTransaction = {
      ...transaction,
      walletAddress: transaction.walletAddress.toLowerCase()
    };
    const [newTx] = await db.insert(transactions).values(normalizedTransaction).returning();
    
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
      .where(eq(transactions.walletAddress, walletAddress.toLowerCase()))
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

    // Query pools with winners, aggregate by wallet ONLY (not by token)
    // Using sql.raw() with validated integers to safely inject LIMIT/OFFSET
    // Calculate USD values using current_price_usd at payout time (when pool ended)
    // Calculate total bet amount from all pools where user participated (as participant or creator)
    const result = await db.execute(sql`
      SELECT
        p.winner_wallet as wallet,
        COUNT(*)::int as wins_count,
        COALESCE(SUM(p.total_pot), 0)::float as total_tokens_won,
        COALESCE(SUM(p.total_pot * COALESCE(p.current_price_usd, 0)), 0)::float as total_usd_won,
        COALESCE(MAX(p.total_pot), 0)::float as biggest_win_tokens,
        COALESCE(MAX(p.total_pot * COALESCE(p.current_price_usd, 0)), 0)::float as biggest_win_usd,
        MAX(p.end_time) as last_win_at,
        (SELECT p2.token_mint FROM pools p2 WHERE p2.winner_wallet = p.winner_wallet AND p2.status = 'ended' ORDER BY p2.end_time DESC LIMIT 1) as token_mint,
        (SELECT p2.token_symbol FROM pools p2 WHERE p2.winner_wallet = p.winner_wallet AND p2.status = 'ended' ORDER BY p2.end_time DESC LIMIT 1) as token_symbol,
        (
          SELECT COALESCE(SUM(p2.entry_amount * COALESCE(p2.initial_price_usd, 0)), 0)
          FROM pools p2
          LEFT JOIN participants part ON part.pool_id = p2.id
          WHERE (part.wallet_address = p.winner_wallet OR p2.creator_wallet = p.winner_wallet)
            AND p2.status = 'ended'
        )::float as total_usd_bet
      FROM pools p
      WHERE p.winner_wallet IS NOT NULL
        AND p.status = 'ended'
      GROUP BY p.winner_wallet
      ORDER BY total_usd_won DESC
      LIMIT ${sql.raw(String(safeLimit))}
      OFFSET ${sql.raw(String(safeOffset))}
    `);

    const winners = (result.rows as any[]).map(row => ({
      wallet: row.wallet as string,
      winsCount: row.wins_count as number,
      totalTokensWon: row.total_tokens_won as number,
      totalUsdWon: row.total_usd_won as number,
      totalUsdBet: row.total_usd_bet as number,
      biggestWinTokens: row.biggest_win_tokens as number,
      biggestWinUsd: row.biggest_win_usd as number,
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

    // Query referral_relations and referral_reward_events joined with pools to get price at payout time
    // Using sql.raw() with validated integers to safely inject LIMIT/OFFSET
    const result = await db.execute(sql`
      SELECT
        rr.referrer_wallet as wallet,
        COUNT(DISTINCT rr.referred_wallet)::int as referrals_count,
        COALESCE(SUM(rre.amount::numeric / 1e9), 0)::float as total_tokens_earned,
        COALESCE(SUM((rre.amount::numeric / 1e9) * COALESCE(p.current_price_usd, 0)), 0)::float as total_usd_earned,
        MIN(rr.created_at) as first_referral_at,
        MAX(rr.created_at) as last_referral_at
      FROM referral_relations rr
      LEFT JOIN referral_reward_events rre ON rr.referrer_wallet = rre.referrer_wallet
      LEFT JOIN pools p ON rre.pool_id = p.id AND p.status = 'ended'
      GROUP BY rr.referrer_wallet
      ORDER BY total_usd_earned DESC
      LIMIT ${sql.raw(String(safeLimit))}
      OFFSET ${sql.raw(String(safeOffset))}
    `);

    const referrers = (result.rows as any[]).map(row => ({
      wallet: row.wallet as string,
      referralsCount: row.referrals_count as number,
      totalTokensEarned: row.total_tokens_earned as number,
      totalUsdEarned: row.total_usd_earned as number,
      activeReferrals: 0, // Could be computed with additional query
      firstReferralAt: row.first_referral_at as Date | null,
      lastReferralAt: row.last_referral_at as Date | null,
    }));

    return { referrers, total };
  }

  // Profile methods
  async getProfile(walletAddress: string): Promise<Profile | undefined> {
    const normalizedWallet = walletAddress.toLowerCase();
    const [profile] = await db.select().from(profiles).where(eq(profiles.walletAddress, normalizedWallet));
    return profile;
  }

  async getOrCreateNonce(walletAddress: string): Promise<string> {
    const normalizedWallet = walletAddress.toLowerCase();
    const nonce = randomBytes(32).toString("hex");

    const existing = await this.getProfile(normalizedWallet);

    if (existing) {
      await db.update(profiles)
        .set({ nonce, updatedAt: new Date() })
        .where(eq(profiles.walletAddress, normalizedWallet));
    } else {
      await db.insert(profiles).values({
        walletAddress: normalizedWallet,
        nonce,
        avatarStyle: "bottts"
      });
    }

    return nonce;
  }

  async updateProfile(walletAddress: string, data: { nickname?: string; avatarUrl?: string; avatarStyle?: string }): Promise<Profile> {
    const normalizedWallet = walletAddress.toLowerCase();
    const existing = await this.getProfile(normalizedWallet);
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
        .where(eq(profiles.walletAddress, normalizedWallet))
        .returning();
      return updated;
    } else {
      const [inserted] = await db.insert(profiles).values({
        walletAddress: normalizedWallet,
        ...updateData,
        nicknameChangeCount: data.nickname !== undefined ? 1 : 0
      } as any).returning();
      return inserted;
    }
  }

  async isNicknameAvailable(nickname: string, excludeWallet?: string): Promise<boolean> {
    const existing = await db.select().from(profiles).where(eq(profiles.nickname, nickname));

    if (existing.length === 0) return true;
    if (excludeWallet && existing[0].walletAddress === excludeWallet.toLowerCase()) return true;

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
    const normalizedWallet = referredWallet.toLowerCase();
    const [relation] = await db.select().from(referralRelations).where(eq(referralRelations.referredWallet, normalizedWallet));
    return relation;
  }

  async createReferralRelation(referredWallet: string, referrerWallet: string, source: string = 'link'): Promise<ReferralRelation | null> {
    const normalizedReferred = referredWallet.toLowerCase();
    const normalizedReferrer = referrerWallet.toLowerCase();

    if (normalizedReferred === normalizedReferrer) {
      console.log("[Referral] Rejected self-referral:", referredWallet);
      return null;
    }

    const existing = await this.getReferralRelation(normalizedReferred);
    if (existing) {
      console.log("[Referral] Wallet already has referrer:", referredWallet);
      return null;
    }

    try {
      const [relation] = await db.insert(referralRelations).values({
        referredWallet: normalizedReferred,
        referrerWallet: normalizedReferrer,
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
    const normalizedWallet = referrerWallet.toLowerCase();
    const invited = await db.select().from(referralRelations).where(eq(referralRelations.referrerWallet, normalizedWallet));

    const rewards = await db.select().from(referralRewards).where(eq(referralRewards.referrerWallet, normalizedWallet));

    const totalEarned = rewards.reduce((sum, r) => sum + BigInt(r.amountPending || "0") + BigInt(r.amountClaimed || "0"), BigInt(0));
    const totalClaimed = rewards.reduce((sum, r) => sum + BigInt(r.amountClaimed || "0"), BigInt(0));

    return {
      totalInvited: invited.length,
      totalEarned: totalEarned.toString(),
      totalClaimed: totalClaimed.toString()
    };
  }

  async getReferralRewards(referrerWallet: string): Promise<ReferralReward[]> {
    const normalizedWallet = referrerWallet.toLowerCase();
    return await db.select().from(referralRewards).where(eq(referralRewards.referrerWallet, normalizedWallet));
  }

  async getInvitedUsers(referrerWallet: string): Promise<ReferralRelation[]> {
    const normalizedWallet = referrerWallet.toLowerCase();
    return await db.select().from(referralRelations).where(eq(referralRelations.referrerWallet, normalizedWallet)).orderBy(desc(referralRelations.createdAt));
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
      const normalizedReferrer = referrerWallet.toLowerCase();

      await db.insert(referralRewardEvents).values({
        poolId,
        tokenMint,
        referrerWallet: normalizedReferrer,
        amount: sharePerReferrer.toString()
      });

      const [existingReward] = await db.select().from(referralRewards)
        .where(and(eq(referralRewards.referrerWallet, normalizedReferrer), eq(referralRewards.tokenMint, tokenMint)));

      if (existingReward) {
        const newPending = BigInt(existingReward.amountPending || "0") + sharePerReferrer;
        await db.update(referralRewards)
          .set({ amountPending: newPending.toString(), lastUpdated: new Date() })
          .where(eq(referralRewards.id, existingReward.id));
      } else {
        await db.insert(referralRewards).values({
          referrerWallet: normalizedReferrer,
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
    const normalizedWallet = referrerWallet.toLowerCase();
    const [existing] = await db.select().from(referralRewards)
      .where(and(eq(referralRewards.referrerWallet, normalizedWallet), eq(referralRewards.tokenMint, tokenMint)));

    if (existing) {
      await db.update(referralRewards)
        .set({ lastClaimTimestamp: timestamp })
        .where(eq(referralRewards.id, existing.id));
    }
  }

  // ============================================
  // NOTIFICATIONS
  // ============================================

  async createNotification(notification: InsertNotification): Promise<Notification> {
    try {
      const normalizedNotification = {
        ...notification,
        walletAddress: notification.walletAddress.toLowerCase()
      };
      const [created] = await db.insert(notifications).values(normalizedNotification).returning();
      return created;
    } catch (err: any) {
      // If table doesn't exist, log warning but don't crash
      if (err.message?.includes('relation "notifications" does not exist')) {
        console.warn('[NOTIFICATIONS] Table does not exist - run migration: npx drizzle-kit push');
      }
      throw err;
    }
  }

  async getNotifications(walletAddress: string, limit: number = 50): Promise<Notification[]> {
    try {
      return await db
        .select()
        .from(notifications)
        .where(eq(notifications.walletAddress, walletAddress.toLowerCase()))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);
    } catch (err: any) {
      // If table doesn't exist, return empty array
      if (err.message?.includes('relation "notifications" does not exist')) {
        console.warn('[NOTIFICATIONS] Table does not exist - returning empty notifications');
        return [];
      }
      throw err;
    }
  }

  async markNotificationAsRead(id: number, walletAddress: string): Promise<boolean> {
    const result = await db
      .update(notifications)
      .set({ read: 1 })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.walletAddress, walletAddress.toLowerCase())
        )
      );
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async markAllNotificationsAsRead(walletAddress: string): Promise<number> {
    const result = await db
      .update(notifications)
      .set({ read: 1 })
      .where(eq(notifications.walletAddress, walletAddress.toLowerCase()));
    return result.rowCount || 0;
  }

  async getUnreadCount(walletAddress: string): Promise<number> {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.walletAddress, walletAddress.toLowerCase()),
          eq(notifications.read, 0)
        )
      );
    return count;
  }

  async deleteNotification(id: number, walletAddress: string): Promise<boolean> {
    const result = await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.walletAddress, walletAddress.toLowerCase())
        )
      );
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async deleteAllNotifications(walletAddress: string): Promise<number> {
    const result = await db
      .delete(notifications)
      .where(eq(notifications.walletAddress, walletAddress.toLowerCase()));
    return result.rowCount || 0;
  }

  // ============================================
  // POOL CHAT MESSAGES
  // ============================================

  async createChatMessage(message: InsertPoolChatMessage): Promise<PoolChatMessage> {
    const normalizedMessage = {
      ...message,
      walletAddress: message.walletAddress.toLowerCase()
    };
    const [created] = await db.insert(poolChatMessages).values(normalizedMessage).returning();
    return created;
  }

  async getChatMessages(poolId: number, limit: number = 100): Promise<PoolChatMessage[]> {
    return await db
      .select()
      .from(poolChatMessages)
      .where(eq(poolChatMessages.poolId, poolId))
      .orderBy(desc(poolChatMessages.createdAt))
      .limit(limit);
  }

  async deletePoolChatMessages(poolId: number): Promise<number> {
    const result = await db
      .delete(poolChatMessages)
      .where(eq(poolChatMessages.poolId, poolId));
    return result.rowCount || 0;
  }

  // ============================================
  // WINNERS FEED
  // ============================================

  async createWinnerFeedEntry(entry: InsertWinnerFeedEntry): Promise<WinnerFeedEntry> {
    const [created] = await db.insert(winnersFeed).values(entry).returning();
    return created;
  }

  async getRecentWinners(limit: number = 15): Promise<WinnerFeedEntry[]> {
    return await db
      .select()
      .from(winnersFeed)
      .orderBy(desc(winnersFeed.createdAt))
      .limit(limit);
  }

  // ============================================
  // PRICE TRACKING
  // ============================================

  async updatePoolPrice(poolId: number, priceUsd: number): Promise<void> {
    await db.update(pools)
      .set({ currentPriceUsd: priceUsd })
      .where(eq(pools.id, poolId));
  }

  async getParticipantByWallet(poolId: number, wallet: string): Promise<Participant | null> {
    const [result] = await db.select()
      .from(participants)
      .where(and(
        eq(participants.poolId, poolId),
        eq(participants.walletAddress, wallet.toLowerCase())
      ))
      .limit(1);
    return result || null;
  }

  async getActivePoolsForPriceTracking(): Promise<Pool[]> {
    return await db.select()
      .from(pools)
      .where(
        or(
          eq(pools.status, 'open'),
          eq(pools.status, 'locked')
        )
      );
  }

  // ============================================
  // SPONSORED/FREE POOLS
  // ============================================

  async addSponsoredParticipant(data: InsertSponsoredParticipant): Promise<SponsoredParticipant> {
    const [result] = await db.insert(sponsoredParticipants).values(data).returning();
    return result;
  }

  async getSponsoredParticipant(poolId: number, realWallet: string): Promise<SponsoredParticipant | null> {
    const [result] = await db.select()
      .from(sponsoredParticipants)
      .where(and(
        eq(sponsoredParticipants.poolId, poolId),
        eq(sponsoredParticipants.realWallet, realWallet.toLowerCase())
      ))
      .limit(1);
    return result || null;
  }

  async getSponsoredParticipantByAuxiliary(poolId: number, auxiliaryWallet: string): Promise<SponsoredParticipant | null> {
    // Use case-insensitive comparison to handle both old (mixed-case) and new (lowercase) entries
    const [result] = await db.select()
      .from(sponsoredParticipants)
      .where(and(
        eq(sponsoredParticipants.poolId, poolId),
        sql`LOWER(${sponsoredParticipants.auxiliaryWallet}) = LOWER(${auxiliaryWallet})`
      ))
      .limit(1);
    return result || null;
  }

  async getSponsoredParticipantsForPool(poolId: number): Promise<SponsoredParticipant[]> {
    return await db.select()
      .from(sponsoredParticipants)
      .where(eq(sponsoredParticipants.poolId, poolId));
  }

  async getUsedAuxiliaryIndexes(poolId: number): Promise<number[]> {
    const results = await db.select({ auxiliaryIndex: sponsoredParticipants.auxiliaryIndex })
      .from(sponsoredParticipants)
      .where(eq(sponsoredParticipants.poolId, poolId));
    return results.map(r => r.auxiliaryIndex);
  }
}

export const storage = new DatabaseStorage();
