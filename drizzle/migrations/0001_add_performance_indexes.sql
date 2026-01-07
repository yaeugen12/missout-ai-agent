-- Migration: Add performance indexes for production scale
-- Created: 2026-01-07
-- Purpose: Optimize queries for 100k+ users

-- ============================================
-- POOLS TABLE INDEXES
-- ============================================

-- Index on status for filtering active pools
CREATE INDEX IF NOT EXISTS idx_pools_status ON pools(status);

-- Index on pool_address for on-chain lookups
CREATE INDEX IF NOT EXISTS idx_pools_address ON pools(pool_address);

-- Index on creator_wallet for user's created pools
CREATE INDEX IF NOT EXISTS idx_pools_creator ON pools(creator_wallet);

-- Index on token_mint for token-specific pools
CREATE INDEX IF NOT EXISTS idx_pools_mint ON pools(token_mint);

-- Composite index for common query pattern (status + start_time)
CREATE INDEX IF NOT EXISTS idx_pools_status_start ON pools(status, start_time DESC);

-- ============================================
-- PARTICIPANTS TABLE INDEXES
-- ============================================

-- Critical: Index on pool_id (most common foreign key lookup)
CREATE INDEX IF NOT EXISTS idx_participants_pool_id ON participants(pool_id);

-- Index on wallet_address for user's participations
CREATE INDEX IF NOT EXISTS idx_participants_wallet ON participants(wallet_address);

-- Composite index for checking if user already participated in pool
CREATE INDEX IF NOT EXISTS idx_participants_pool_wallet ON participants(pool_id, wallet_address);

-- ============================================
-- TRANSACTIONS TABLE INDEXES
-- ============================================

-- Index on pool_id for pool transaction history
CREATE INDEX IF NOT EXISTS idx_transactions_pool_id ON transactions(pool_id);

-- Index on wallet_address for user transaction history
CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_address);

-- Index on type for filtering by transaction type
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

-- Index on timestamp for time-based queries
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);

-- Composite index for user's transactions in a pool
CREATE INDEX IF NOT EXISTS idx_transactions_pool_wallet ON transactions(pool_id, wallet_address);

-- ============================================
-- PROFILES TABLE INDEXES
-- ============================================

-- Unique index on wallet_address (already unique constraint, but explicit index)
CREATE INDEX IF NOT EXISTS idx_profiles_wallet ON profiles(wallet_address);

-- Index on nickname for nickname availability checks
CREATE INDEX IF NOT EXISTS idx_profiles_nickname ON profiles(nickname) WHERE nickname IS NOT NULL;

-- ============================================
-- REFERRAL TABLES INDEXES
-- ============================================

-- Index on referred_wallet (unique constraint exists)
CREATE INDEX IF NOT EXISTS idx_referral_relations_referred ON referral_relations(referred_wallet);

-- Index on referrer_wallet for finding all referrals by a user
CREATE INDEX IF NOT EXISTS idx_referral_relations_referrer ON referral_relations(referrer_wallet);

-- Index on created_at for time-based referral queries
CREATE INDEX IF NOT EXISTS idx_referral_relations_created ON referral_relations(created_at DESC);

-- Index on referrer_wallet for reward lookups
CREATE INDEX IF NOT EXISTS idx_referral_rewards_wallet ON referral_rewards(referrer_wallet);

-- Composite index on referrer_wallet + token_mint (matches unique constraint)
CREATE INDEX IF NOT EXISTS idx_referral_rewards_wallet_mint ON referral_rewards(referrer_wallet, token_mint);

-- Index on pool_id for reward events
CREATE INDEX IF NOT EXISTS idx_referral_events_pool ON referral_reward_events(pool_id);

-- Index on referrer_wallet for reward events
CREATE INDEX IF NOT EXISTS idx_referral_events_referrer ON referral_reward_events(referrer_wallet);

-- Index on referrer_wallet for claims
CREATE INDEX IF NOT EXISTS idx_referral_claims_referrer ON referral_claims(referrer_wallet);

-- Index on status for pending claims
CREATE INDEX IF NOT EXISTS idx_referral_claims_status ON referral_claims(status);

-- ============================================
-- STATISTICS & VERIFICATION
-- ============================================

-- Show index sizes and usage (for monitoring)
-- Run this manually: SELECT * FROM pg_stat_user_indexes WHERE schemaname = 'public';

-- Analyze tables to update statistics
ANALYZE pools;
ANALYZE participants;
ANALYZE transactions;
ANALYZE profiles;
ANALYZE referral_relations;
ANALYZE referral_rewards;
ANALYZE referral_reward_events;
ANALYZE referral_claims;
