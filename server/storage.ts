import { db } from "./db";
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
  getPools(): Promise<Pool[]>;
  getPool(id: number): Promise<Pool | undefined>;
  createPool(pool: InsertPool): Promise<Pool>;
  updatePoolStatus(id: number, status: string, winner?: string): Promise<Pool>;
  
  // Participants
  getParticipants(poolId: number): Promise<Participant[]>;
  addParticipant(participant: InsertParticipant): Promise<Participant>;
  
  // Transactions
  addTransaction(transaction: InsertTransaction): Promise<Transaction>;
  getPoolTransactions(poolId: number): Promise<Transaction[]>;
  
  // Leaderboard (Mock stats)
  getLeaderboard(): Promise<{
    topWinners: { wallet: string; totalWon: number }[];
    topReferrers: { wallet: string; referrals: number }[];
  }>;

  // Profiles
  getProfile(walletAddress: string): Promise<Profile | undefined>;
  getOrCreateNonce(walletAddress: string): Promise<string>;
  updateProfile(walletAddress: string, data: { nickname?: string; avatarUrl?: string; avatarStyle?: string }): Promise<Profile>;
  isNicknameAvailable(nickname: string, excludeWallet?: string): Promise<boolean>;
  checkNicknameCooldown(walletAddress: string): Promise<{ canChange: boolean; cooldownEnds?: Date }>;
}

export class DatabaseStorage implements IStorage {
  async getPools(): Promise<Pool[]> {
    return await db.select().from(pools).orderBy(desc(pools.startTime));
  }

  async getPool(id: number): Promise<Pool | undefined> {
    const [pool] = await db.select().from(pools).where(eq(pools.id, id));
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

  async getParticipantsWithProfiles(poolId: number): Promise<Array<Participant & { displayName?: string; displayAvatar?: string }>> {
    const participantsList = await db.select().from(participants).where(eq(participants.poolId, poolId));
    
    const generateDicebearAvatar = (wallet: string, style: string = "bottts") => 
      `https://api.dicebear.com/7.x/${style}/svg?seed=${wallet}`;
    
    const enrichedParticipants = await Promise.all(
      participantsList.map(async (p) => {
        const profile = await this.getProfile(p.walletAddress);
        return {
          ...p,
          displayName: profile?.nickname || undefined,
          displayAvatar: profile?.avatarUrl || generateDicebearAvatar(p.walletAddress, profile?.avatarStyle || "bottts"),
        };
      })
    );
    
    return enrichedParticipants;
  }

  async addParticipant(participant: InsertParticipant): Promise<Participant> {
    // Transaction to add participant and update pool count/pot
    return await db.transaction(async (tx) => {
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
    // Mock implementation for MVP using simple aggregations
    // Real impl would be complex SQL
    const topWinners = [
      { wallet: "8xqt...3f9a", totalWon: 150.5 },
      { wallet: "Ab2d...9k12", totalWon: 80.0 },
      { wallet: "5f3a...1b9c", totalWon: 45.2 },
    ];
    
    const topReferrers = [
      { wallet: "9y1m...2p8z", referrals: 42 },
      { wallet: "3k9c...7h4x", referrals: 28 },
      { wallet: "7j2n...5r1q", referrals: 15 },
    ];

    return { topWinners, topReferrers };
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

  async claimReferralReward(referrerWallet: string, tokenMint: string): Promise<{ success: boolean; amount: string; error?: string }> {
    const [reward] = await db.select().from(referralRewards)
      .where(and(eq(referralRewards.referrerWallet, referrerWallet), eq(referralRewards.tokenMint, tokenMint)));

    if (!reward || BigInt(reward.amountPending || "0") <= BigInt(0)) {
      return { success: false, amount: "0", error: "No pending rewards to claim" };
    }

    const amountToClaim = reward.amountPending || "0";

    await db.insert(referralClaims).values({
      referrerWallet,
      tokenMint,
      amount: amountToClaim,
      status: "pending"
    });

    await db.update(referralRewards)
      .set({
        amountPending: "0",
        amountClaimed: (BigInt(reward.amountClaimed || "0") + BigInt(amountToClaim)).toString(),
        lastUpdated: new Date()
      })
      .where(eq(referralRewards.id, reward.id));

    return { success: true, amount: amountToClaim };
  }

  async updateClaimStatus(claimId: number, status: string, txSignature?: string): Promise<void> {
    await db.update(referralClaims)
      .set({ status, txSignature })
      .where(eq(referralClaims.id, claimId));
  }

  async getPendingClaims(): Promise<ReferralClaim[]> {
    return await db.select().from(referralClaims).where(eq(referralClaims.status, "pending"));
  }
}

export const storage = new DatabaseStorage();
