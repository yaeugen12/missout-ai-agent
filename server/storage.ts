import { db } from "./db";
import {
  pools, participants, transactions, profiles,
  type Pool, type InsertPool, type Participant, type InsertParticipant,
  type Transaction, type InsertTransaction, type Profile
} from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
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
    
    const enrichedParticipants = await Promise.all(
      participantsList.map(async (p) => {
        const profile = await this.getProfile(p.walletAddress);
        return {
          ...p,
          displayName: profile?.nickname || undefined,
          displayAvatar: profile?.avatarUrl || undefined,
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
}

export const storage = new DatabaseStorage();
