import { pgTable, text, serial, integer, doublePrecision, timestamp, bigint, unique, index } from "drizzle-orm/pg-core";
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
  tokenLogoUrl: text("token_logo_url"),
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

  // Volatility tracking
  initialPriceUsd: doublePrecision("initial_price_usd"),
  currentPriceUsd: doublePrecision("current_price_usd"),

  // Randomness
  randomnessAccount: text("randomness_account"),
  randomnessHex: text("randomness_hex"),
  txHash: text("tx_hash"),

  // Flags
  rentClaimed: integer("rent_claimed").default(0),

  // Sponsored/Free Pools
  isFree: integer("is_free").default(0), // 0 = normal, 1 = free to join
  sponsoredBy: text("sponsored_by"), // wallet that sponsors the pool
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
  betUsd: doublePrecision("bet_usd"),              // USD value of bet at join time
  priceAtJoinUsd: doublePrecision("price_at_join_usd"), // Token price when user joined
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
  poolId: integer("pool_id"),
  walletAddress: text("wallet_address").notNull(),
  operationType: text("operation_type"),
  usedAt: timestamp("used_at").defaultNow(),
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

export const insertPoolSchema = createInsertSchema(pools, {
  tokenLogoUrl: z.string().nullish(), // Accept string | null | undefined
}).omit({
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

// ============================================
// NOTIFICATIONS
// ============================================

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  type: text("type").notNull(), // 'join', 'unlocked', 'randomness', 'win', 'cancel'
  title: text("title").notNull(),
  message: text("message").notNull(),
  poolId: integer("pool_id"),
  poolName: text("pool_name"),
  randomness: text("randomness"),
  verifyUrl: text("verify_url"),
  read: integer("read").default(0).notNull(), // SQLite compat: 0=false, 1=true
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// Pool Chat Messages
export const poolChatMessages = pgTable("pool_chat_messages", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull().references(() => pools.id, { onDelete: "cascade" }),
  walletAddress: text("wallet_address").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  poolIdIdx: index("pool_chat_messages_pool_id_idx").on(table.poolId),
  createdAtIdx: index("pool_chat_messages_created_at_idx").on(table.createdAt),
}));

export type PoolChatMessage = typeof poolChatMessages.$inferSelect;
export type InsertPoolChatMessage = typeof poolChatMessages.$inferInsert;

// ============================================
// WINNERS FEED
// ============================================

export const winnersFeed = pgTable("winners_feed", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull().references(() => pools.id),
  winnerWallet: text("winner_wallet").notNull(),
  displayName: text("display_name").notNull(), // nickname OR shortened wallet
  avatarUrl: text("avatar_url"), // custom avatar or null (will generate identicon)
  tokenSymbol: text("token_symbol").notNull(),
  betUsd: doublePrecision("bet_usd").notNull(), // USD value at join time
  winUsd: doublePrecision("win_usd").notNull(), // USD value at payout time
  roiPercent: doublePrecision("roi_percent").notNull(), // (win - bet) / bet * 100
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index("winners_feed_created_at_idx").on(table.createdAt),
}));

export type WinnerFeedEntry = typeof winnersFeed.$inferSelect;
export type InsertWinnerFeedEntry = typeof winnersFeed.$inferInsert;

// ============================================
// SPONSORED PARTICIPANTS (Free Pool Mapping)
// ============================================

export const sponsoredParticipants = pgTable("sponsored_participants", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull().references(() => pools.id, { onDelete: "cascade" }),
  realWallet: text("real_wallet").notNull(), // actual participant who will receive payout
  auxiliaryWallet: text("auxiliary_wallet").notNull(), // wallet used on-chain for this participant
  auxiliaryIndex: integer("auxiliary_index").notNull(), // which auxiliary wallet (0-8)
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => ({
  uniquePoolReal: unique().on(table.poolId, table.realWallet),
  poolIdIdx: index("sponsored_participants_pool_id_idx").on(table.poolId),
}));

export type SponsoredParticipant = typeof sponsoredParticipants.$inferSelect;
export type InsertSponsoredParticipant = typeof sponsoredParticipants.$inferInsert;
