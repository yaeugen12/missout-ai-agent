-- ============================================
-- SECURITY FIXES MIGRATION
-- ============================================
-- This migration addresses critical security issues:
-- 1. Creates used_transactions table for replay attack prevention
-- 2. Adds UNIQUE constraint on (pool_id, wallet_address) in participants
-- 3. Adds indexes for performance
-- ============================================

-- ============================================
-- 1. CREATE used_transactions TABLE
-- ============================================
-- Prevents replay attacks by tracking all used transaction hashes
-- UNIQUE constraint on tx_hash prevents race conditions at DB level

CREATE TABLE IF NOT EXISTS used_transactions (
  id SERIAL PRIMARY KEY,
  tx_hash TEXT UNIQUE NOT NULL,
  pool_id INTEGER,
  wallet_address TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  used_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for used_transactions
CREATE INDEX IF NOT EXISTS idx_used_tx_hash ON used_transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_used_tx_pool ON used_transactions(pool_id);
CREATE INDEX IF NOT EXISTS idx_used_tx_wallet ON used_transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_used_tx_operation ON used_transactions(operation_type);
CREATE INDEX IF NOT EXISTS idx_used_tx_timestamp ON used_transactions(used_at);

COMMENT ON TABLE used_transactions IS 'Tracks all used transaction hashes to prevent replay attacks';
COMMENT ON COLUMN used_transactions.tx_hash IS 'Solana transaction signature (unique)';
COMMENT ON COLUMN used_transactions.pool_id IS 'Pool ID associated with this transaction (nullable for some operations)';
COMMENT ON COLUMN used_transactions.wallet_address IS 'Wallet address that submitted the transaction';
COMMENT ON COLUMN used_transactions.operation_type IS 'Type of operation: create_pool, join, donate, cancel, claim_refund, claim_rent';

-- ============================================
-- 2. ADD UNIQUE CONSTRAINT TO participants
-- ============================================
-- Prevents duplicate participants in the same pool
-- This fixes the issue where a user could join the same pool multiple times

-- First, remove any existing duplicates (keep oldest entry per pool+wallet)
DELETE FROM participants
WHERE id NOT IN (
  SELECT MIN(id)
  FROM participants
  GROUP BY pool_id, wallet_address
);

-- Now add the UNIQUE constraint
-- Drop constraint if it already exists (idempotent)
ALTER TABLE participants DROP CONSTRAINT IF EXISTS unique_pool_participant;

-- Add the constraint
ALTER TABLE participants
  ADD CONSTRAINT unique_pool_participant
  UNIQUE (pool_id, wallet_address);

COMMENT ON CONSTRAINT unique_pool_participant ON participants IS 'Ensures each wallet can only join a pool once';

-- ============================================
-- 3. ADD PERFORMANCE INDEXES
-- ============================================

-- Participants indexes
CREATE INDEX IF NOT EXISTS idx_participants_pool_id ON participants(pool_id);
CREATE INDEX IF NOT EXISTS idx_participants_wallet ON participants(wallet_address);
CREATE INDEX IF NOT EXISTS idx_participants_refund_claimed ON participants(pool_id, refund_claimed) WHERE refund_claimed = 0;

-- Pools indexes
CREATE INDEX IF NOT EXISTS idx_pools_status ON pools(status);
CREATE INDEX IF NOT EXISTS idx_pools_creator ON pools(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_pools_pool_address ON pools(pool_address);
CREATE INDEX IF NOT EXISTS idx_pools_rent_claimed ON pools(rent_claimed, status) WHERE rent_claimed = 0;

-- Transactions indexes
CREATE INDEX IF NOT EXISTS idx_transactions_pool_wallet ON transactions(pool_id, wallet_address);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

-- Referral tables indexes
CREATE INDEX IF NOT EXISTS idx_referral_relations_referred ON referral_relations(referred_wallet);
CREATE INDEX IF NOT EXISTS idx_referral_relations_referrer ON referral_relations(referrer_wallet);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_wallet_mint ON referral_rewards(referrer_wallet, token_mint);
CREATE INDEX IF NOT EXISTS idx_referral_claims_wallet ON referral_claims(referrer_wallet);
CREATE INDEX IF NOT EXISTS idx_referral_claims_status ON referral_claims(status);

-- ============================================
-- 4. ADD REFERRAL CLAIM LOCK COLUMN
-- ============================================
-- Adds additional protection against double-claims at the application level
-- The lastClaimTimestamp in referral_rewards already provides protection,
-- but this adds an explicit lock column for extra safety

-- Check if column exists, if not add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'referral_rewards'
    AND column_name = 'claim_lock'
  ) THEN
    ALTER TABLE referral_rewards
      ADD COLUMN claim_lock BOOLEAN DEFAULT FALSE;

    CREATE INDEX idx_referral_rewards_claim_lock ON referral_rewards(claim_lock) WHERE claim_lock = TRUE;

    COMMENT ON COLUMN referral_rewards.claim_lock IS 'Temporary lock flag during claim processing (prevents double-claims)';
  END IF;
END $$;

-- ============================================
-- 5. VERIFY SCHEMA
-- ============================================

-- Show all tables
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE columns.table_name = tables.table_name) as column_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Show unique constraints on participants
SELECT
  con.conname as constraint_name,
  pg_get_constraintdef(con.oid) as constraint_definition
FROM pg_constraint con
INNER JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'participants'
  AND con.contype = 'u';

-- Show indexes on used_transactions
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'used_transactions'
ORDER BY indexname;
