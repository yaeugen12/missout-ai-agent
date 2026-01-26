-- Add sponsored pool support for free draws
-- Migration 0010: Add is_free and sponsored_by fields to pools table

ALTER TABLE pools ADD COLUMN IF NOT EXISTS is_free INTEGER DEFAULT 0;
ALTER TABLE pools ADD COLUMN IF NOT EXISTS sponsored_by TEXT;

-- Create sponsored_participants table for mapping real wallets to auxiliary wallets
CREATE TABLE IF NOT EXISTS sponsored_participants (
  id SERIAL PRIMARY KEY,
  pool_id INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  real_wallet TEXT NOT NULL,
  auxiliary_wallet TEXT NOT NULL,
  auxiliary_index INTEGER NOT NULL,
  joined_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(pool_id, real_wallet)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS sponsored_participants_pool_id_idx ON sponsored_participants(pool_id);
