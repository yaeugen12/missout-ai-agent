-- Add token_logo_url column to pools table
ALTER TABLE pools ADD COLUMN IF NOT EXISTS token_logo_url TEXT;
