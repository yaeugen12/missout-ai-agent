-- Create notifications table for persistent notifications
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  type TEXT NOT NULL, -- 'join', 'unlocked', 'randomness', 'win', 'cancel'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  pool_id INTEGER,
  pool_name TEXT,
  randomness TEXT, -- For randomness notifications
  verify_url TEXT, -- For randomness verification
  read INTEGER NOT NULL DEFAULT 0, -- 0=false, 1=true
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by wallet
CREATE INDEX IF NOT EXISTS idx_notifications_wallet ON notifications(wallet_address);

-- Index for fast lookup by pool
CREATE INDEX IF NOT EXISTS idx_notifications_pool ON notifications(pool_id);

-- Index for unread notifications
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(wallet_address, read) WHERE read = 0;
