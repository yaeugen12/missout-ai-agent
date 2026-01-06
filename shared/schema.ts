import { pgTable, text, serial, integer, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const pools = pgTable("pools", {
  id: serial("id").primaryKey(),
  poolAddress: text("pool_address"), // On-chain PDA / Pool ID
  tokenSymbol: text("token_symbol").notNull(), // e.g. SOL, BONK
  tokenName: text("token_name").notNull(),
  tokenMint: text("token_mint"), // SPL token mint address
  entryAmount: doublePrecision("entry_amount").notNull(),
  minParticipants: integer("min_participants").notNull(),
  maxParticipants: integer("max_participants").notNull(),
  participantsCount: integer("participants_count").default(0),
  status: text("status").notNull(), // OPEN, LOCKED, UNLOCKED, RANDOMNESS_COMMITTED, RANDOMNESS_REVEALED, WINNER_SELECTED, ENDED, CANCELLED
  startTime: timestamp("start_time").defaultNow(),
  lockDuration: integer("lock_duration").notNull(), // in minutes
  lockStartTime: integer("lock_start_time"), // Unix timestamp when lock began
  lockTime: timestamp("lock_time"), // calculated when pool fills or timer hits
  endTime: timestamp("end_time"),
  winnerWallet: text("winner_wallet"),
  totalPot: doublePrecision("total_pot").default(0),
  donatedAmount: doublePrecision("donated_amount").default(0), // Non-participatory donations
  creatorWallet: text("creator_wallet").notNull(),
  // Pool Monitor fields
  randomnessAccount: text("randomness_account"), // On-chain randomness PDA
  randomnessHex: text("randomness_hex"), // Revealed randomness value
  txHash: text("tx_hash"), // Winner payout transaction hash
  allowMock: integer("allow_mock").default(0), // 1 = use mock randomness for testing
});

export const participants = pgTable("participants", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  avatar: text("avatar"), // mock avatar url
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  type: text("type").notNull(), // JOIN, DONATE
  amount: doublePrecision("amount").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

// Schemas
export const insertPoolSchema = createInsertSchema(pools).omit({ 
  id: true, 
  participantsCount: true, 
  status: true, 
  startTime: true, 
  lockTime: true, 
  endTime: true, 
  winnerWallet: true, 
  totalPot: true,
  donatedAmount: true
});

export const insertParticipantSchema = createInsertSchema(participants).omit({ 
  id: true, 
  joinedAt: true 
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({ 
  id: true, 
  timestamp: true 
});

// Types
export type Pool = typeof pools.$inferSelect;
export type InsertPool = z.infer<typeof insertPoolSchema>;
export type Participant = typeof participants.$inferSelect;
export type InsertParticipant = z.infer<typeof insertParticipantSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

// API Request Types
export type CreatePoolRequest = InsertPool;
export type JoinPoolRequest = { walletAddress: string; avatar?: string };
export type DonateRequest = { walletAddress: string; amount: number };
