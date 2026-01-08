-- Migration: Add used_transactions table for replay attack prevention
-- Date: 2026-01-08
-- Purpose: Track all used transaction hashes to prevent replay attacks

-- Create used_transactions table with UNIQUE constraint on tx_hash
CREATE TABLE IF NOT EXISTS used_transactions (
  tx_hash VARCHAR(120) PRIMARY KEY,
  pool_id INTEGER NOT NULL,
  wallet_address VARCHAR(64) NOT NULL,
  operation_type VARCHAR(32) NOT NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for cleanup queries (remove old transactions)
CREATE INDEX IF NOT EXISTS idx_used_transactions_timestamp ON used_transactions(used_at);

-- Index for querying by pool (analytics/debugging)
CREATE INDEX IF NOT EXISTS idx_used_transactions_pool ON used_transactions(pool_id);

-- Index for querying by wallet (analytics/debugging)
CREATE INDEX IF NOT EXISTS idx_used_transactions_wallet ON used_transactions(wallet_address);

-- Comment the table
COMMENT ON TABLE used_transactions IS 'Tracks all used transaction hashes to prevent replay attacks';
COMMENT ON COLUMN used_transactions.tx_hash IS 'Solana transaction signature (PRIMARY KEY prevents duplicates)';
COMMENT ON COLUMN used_transactions.pool_id IS 'Pool ID associated with this transaction';
COMMENT ON COLUMN used_transactions.wallet_address IS 'Wallet address that submitted the transaction';
COMMENT ON COLUMN used_transactions.operation_type IS 'Type of operation: join, donate, cancel, claim_refund, claim_rent, create_pool';
COMMENT ON COLUMN used_transactions.used_at IS 'Timestamp when transaction was first used';
