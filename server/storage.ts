import { db } from "./db";
import {
  pools, participants, transactions,
  type Pool, type InsertPool, type Participant, type InsertParticipant,
  type Transaction, type InsertTransaction
} from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";

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
}

export const storage = new DatabaseStorage();
