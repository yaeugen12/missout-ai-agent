-- Add claim tracking columns to pools and participants tables
-- This prevents showing already claimed refunds/rents in the Claims page

ALTER TABLE pools
ADD COLUMN IF NOT EXISTS rent_claimed INTEGER DEFAULT 0;

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS refund_claimed INTEGER DEFAULT 0;

-- Create index for faster queries on claimable pools
CREATE INDEX IF NOT EXISTS idx_pools_rent_claimed ON pools(rent_claimed, status);
CREATE INDEX IF NOT EXISTS idx_participants_refund_claimed ON participants(refund_claimed, pool_id);
