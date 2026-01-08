# Security Fixes Migration Guide

## Overview

This migration addresses critical security vulnerabilities:

1. **Replay Attack Prevention**: Creates `used_transactions` table
2. **Duplicate Join Prevention**: Adds UNIQUE constraint on (pool_id, wallet_address)
3. **Referral Double-Claim Fix**: Adds proper locking mechanism
4. **Performance Optimization**: Adds indexes for better query performance

## Prerequisites

- PostgreSQL database access
- Database connection string (DATABASE_URL)
- Backup of current database (recommended)

## Step 1: Backup Database (CRITICAL)

```bash
# Export DATABASE_URL from your .env
export $(grep DATABASE_URL .env | xargs)

# Create backup
pg_dump $DATABASE_URL > backup_before_security_fixes_$(date +%Y%m%d_%H%M%S).sql

# Or if using psql directly:
psql $DATABASE_URL -c "\dt" > tables_before_migration.txt
```

## Step 2: Apply Migration

```bash
# Navigate to missout directory
cd missout

# Apply the migration
psql $DATABASE_URL -f migrations/001_security_fixes.sql

# Verify tables were created
psql $DATABASE_URL -c "\d used_transactions"
psql $DATABASE_URL -c "\d+ participants"
```

## Step 3: Update Schema.ts

The `shared/schema.ts` file needs to be updated to reflect the new UNIQUE constraint.

**Change the `participants` table definition from:**

```typescript
export const participants = pgTable("participants", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  avatar: text("avatar"),
  joinedAt: timestamp("joined_at").defaultNow(),
  refundClaimed: integer("refund_claimed").default(0),
});
```

**To:**

```typescript
export const participants = pgTable("participants", {
  id: serial("id").primaryKey(),
  poolId: integer("pool_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  avatar: text("avatar"),
  joinedAt: timestamp("joined_at").defaultNow(),
  refundClaimed: integer("refund_claimed").default(0),
}, (table) => ({
  // SECURITY: Unique constraint prevents duplicate participants in the same pool
  uniquePoolParticipant: unique("unique_pool_participant").on(table.poolId, table.walletAddress),
}));
```

## Step 4: Verify Migration

```bash
# Check if used_transactions table exists
psql $DATABASE_URL -c "SELECT COUNT(*) FROM used_transactions;"

# Check if unique constraint was added
psql $DATABASE_URL -c "
  SELECT con.conname as constraint_name
  FROM pg_constraint con
  INNER JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'participants' AND con.contype = 'u';
"

# Check indexes
psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE tablename = 'used_transactions';"
```

## Step 5: Test the Application

```bash
# Restart the server
pm2 restart missout-backend

# Or if running directly:
npm run dev
```

## Expected Results

After applying the migration, you should see:

1. ✅ **used_transactions table** with 5 indexes
2. ✅ **unique_pool_participant** constraint on participants table
3. ✅ Multiple performance indexes on all tables
4. ✅ **claim_lock** column in referral_rewards table

## Rollback (If Needed)

If something goes wrong, you can rollback:

```bash
# Restore from backup
psql $DATABASE_URL < backup_before_security_fixes_YYYYMMDD_HHMMSS.sql
```

## Security Improvements

### 1. Replay Attack Prevention

**Before**: Users could submit the same transaction hash multiple times
**After**: Database enforces UNIQUE constraint on tx_hash, preventing replay attacks

### 2. Duplicate Join Prevention

**Before**: Users could join the same pool multiple times by exploiting race conditions
**After**: UNIQUE constraint on (pool_id, wallet_address) prevents duplicates at DB level

### 3. Referral Double-Claim Protection

**Before**: Concurrent requests could claim rewards multiple times
**After**: SELECT FOR UPDATE with lastClaimTimestamp provides protection

## Monitoring After Migration

After deployment, monitor:

```bash
# Check for replay attack attempts (should return 0 or very low)
psql $DATABASE_URL -c "
  SELECT COUNT(*) as duplicate_attempts
  FROM (
    SELECT tx_hash, COUNT(*) as cnt
    FROM used_transactions
    GROUP BY tx_hash
    HAVING COUNT(*) > 1
  ) duplicates;
"

# Check for duplicate participant attempts (should return 0)
psql $DATABASE_URL -c "
  SELECT pool_id, wallet_address, COUNT(*) as cnt
  FROM participants
  GROUP BY pool_id, wallet_address
  HAVING COUNT(*) > 1;
"

# Monitor referral claims
psql $DATABASE_URL -c "
  SELECT status, COUNT(*) as count
  FROM referral_claims
  GROUP BY status;
"
```

## Troubleshooting

### Error: relation "used_transactions" already exists

This is OK - the migration is idempotent. The table already exists.

### Error: constraint "unique_pool_participant" already exists

This is OK - the constraint already exists, no action needed.

### Error: duplicate key value violates unique constraint

This means the migration found existing duplicates. Check:

```bash
# Find duplicate participants
psql $DATABASE_URL -c "
  SELECT pool_id, wallet_address, COUNT(*) as cnt
  FROM participants
  GROUP BY pool_id, wallet_address
  HAVING COUNT(*) > 1;
"
```

The migration automatically removes duplicates (keeps oldest), but review manually if needed.

## Next Steps

1. Deploy the updated code to production
2. Monitor logs for any "duplicate" errors
3. Set up alerts for used_transactions table growth
4. Consider adding cleanup job for old transactions (>90 days)

## Maintenance

Add to cron (monthly cleanup):

```bash
# Cleanup old transaction records (older than 90 days)
psql $DATABASE_URL -c "
  DELETE FROM used_transactions
  WHERE used_at < NOW() - INTERVAL '90 days';
"
```
