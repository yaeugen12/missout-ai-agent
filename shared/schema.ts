import { pgTable, text, serial, integer, doublePrecision, timestamp, bigint, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================
// POOLS
// ============================================

export const pools = pgTable("pools", {
  id: serial("id").primaryKey(),
  poolAddress: text("pool_address"),
  tokenSymbol: text("token_symbol").notNull(),
  tokenName: text("token_name").notNull(),
  tokenMint: text("token_mint"),
  entryAmount: doublePrecision("entry_amount").notNull(),
  minParticipants: integer("min_participants").notNull(),
  maxParticipants: integer("max_participants").notNull(),
  participantsCount: integer("participants_count").default(0),
  status: text("status").notNull(),
  startTime: timestamp("start_time").defaultNow(),
  lockDuration: integer("lock_duration").notNull(),
  lockStartTime: integer("lock_start_time"),
  lockTime: timestamp("lock_time"),
  endTime: timestamp("end_time"),
  winnerWallet: text("winner_wallet"),
  totalPot: doublePrecision("total_pot").default(0),
  donatedAmount: doublePrecision("donated_amount").default(0),
  creatorWallet: text("creator_wallet").notNull(),

  // Randomness
  randomnessAccount: text("randomness_account"),
  randomnessHex: text("randomness_hex"),
  txHash: text("tx_hash"),

  // Flags
  allowMock: integer("allow_mock").default(0),
  rentClaimed: integer("rent_claimed").default(0),
});

// ============================================
// PARTICIPANTS
// ============================================

export const participants = pgTable("participants", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  avatar: text("avatar"),
  joinedAt: timestamp("joined_at").defaultNow(),
  refundClaimed: integer("refund_claimed").default(0),
});

// ============================================
// TRANSACTIONS
// ============================================

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  type: text("type").notNull(),
  amount: doublePrecision("amount").notNull(),
  txHash: text("tx_hash"),
  timestamp: timestamp("timestamp").defaultNow(),
});

// ============================================
// PROFILES
// ============================================

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull().unique(),
  nickname: text("nickname").unique(),
  avatarUrl: text("avatar_url"),
  avatarStyle: text("avatar_style").default("bottts"),
  nonce: text("nonce"),
  nicknameChangeCount: integer("nickname_change_count").default(0),
  lastNicknameChange: timestamp("last_nickname_change"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================
// USED TRANSACTIONS (Anti-Replay)
// ============================================

export const usedTransactions = pgTable("used_transactions", {
  id: serial("id").primaryKey(),
  txHash: text("tx_hash").notNull().unique(),
  walletAddress: text("wallet_address").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================
// REFERRALS
// ============================================

export const referralRelations = pgTable("referral_relations", {
  id: serial("id").primaryKey(),
  referredWallet: text("referred_wallet").notNull().unique(),
  referrerWallet: text("referrer_wallet").notNull(),
  source: text("source").default("link"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const referralRewards = pgTable("referral_rewards", {
  id: serial("id").primaryKey(),
  referrerWallet: text("referrer_wallet").notNull(),
  tokenMint: text("token_mint").notNull(),
  amountPending: text("amount_pending").default("0"),
  amountClaimed: text("amount_claimed").default("0"),
  lastUpdated: timestamp("last_updated").defaultNow(),
  lastClaimTimestamp: bigint("last_claim_timestamp", { mode: "number" }),
}, (table) => ({
  uniqueReferrerMint: unique().on(table.referrerWallet, table.tokenMint),
}));

export const referralRewardEvents = pgTable("referral_reward_events", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull(),
  tokenMint: text("token_mint").notNull(),
  referrerWallet: text("referrer_wallet").notNull(),
  amount: text("amount").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const referralClaims = pgTable("referral_claims", {
  id: serial("id").primaryKey(),
  referrerWallet: text("referrer_wallet").notNull(),
  tokenMint: text("token_mint").notNull(),
  amount: text("amount").notNull(),
  txSignature: text("tx_signature"),
  status: text("status").default("pending"),
  claimedAt: timestamp("claimed_at").defaultNow(),
});

// ============================================
// DRIZZLE SCHEMAS
// ============================================

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

export const insertProfileSchema = createInsertSchema(profiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  nonce: true,
  lastNicknameChange: true
});

export const updateProfileSchema = z.object({
  nickname: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores allowed").optional(),
  avatarUrl: z.string().optional().nullable(),
  avatarStyle: z.enum(["bottts", "identicon", "shapes", "thumbs", "pixel-art"]).optional(),
});

// ============================================
// TYPES
// ============================================

export type Pool = typeof pools.$inferSelect;
export type InsertPool = z.infer<typeof insertPoolSchema>;

export type Participant = typeof participants.$inferSelect;
export type InsertParticipant = z.infer<typeof insertParticipantSchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;

export type UsedTransaction = typeof usedTransactions.$inferSelect;

export type ReferralRelation = typeof referralRelations.$inferSelect;
export type InsertReferralRelation = typeof referralRelations.$inferInsert;

export type ReferralReward = typeof referralRewards.$inferSelect;
export type ReferralRewardEvent = typeof referralRewardEvents.$inferSelect;
export type ReferralClaim = typeof referralClaims.$inferSelect;