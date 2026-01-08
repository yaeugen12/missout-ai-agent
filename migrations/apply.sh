#!/bin/bash

###############################################################################
# Security Fixes Migration Script
# Applies all security fixes to the database
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║    MISSOUT SECURITY FIXES MIGRATION                   ║${NC}"
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ ERROR: DATABASE_URL environment variable not set${NC}"
  echo ""
  echo "Please set DATABASE_URL before running this script:"
  echo "  export DATABASE_URL='postgresql://user:pass@host:5432/database'"
  echo ""
  echo "Or source your .env file:"
  echo "  export \$(grep DATABASE_URL .env | xargs)"
  exit 1
fi

echo -e "${YELLOW}Database URL: ${DATABASE_URL%%:*}://****@****${NC}"
echo ""

# Step 1: Backup
echo -e "${YELLOW}[1/4] Creating database backup...${NC}"
BACKUP_FILE="backup_security_fixes_$(date +%Y%m%d_%H%M%S).sql"

if pg_dump "$DATABASE_URL" > "$BACKUP_FILE" 2>/dev/null; then
  echo -e "${GREEN}✅ Backup created: $BACKUP_FILE${NC}"
else
  echo -e "${RED}❌ Failed to create backup. Continue anyway? (y/N)${NC}"
  read -r response
  if [[ ! "$response" =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi
echo ""

# Step 2: Show current state
echo -e "${YELLOW}[2/4] Checking current database state...${NC}"

# Check if used_transactions exists
if psql "$DATABASE_URL" -t -c "SELECT 1 FROM information_schema.tables WHERE table_name='used_transactions'" 2>/dev/null | grep -q 1; then
  echo -e "${YELLOW}⚠️  Table 'used_transactions' already exists (will skip creation)${NC}"
else
  echo -e "${GREEN}✓ Table 'used_transactions' does not exist (will be created)${NC}"
fi

# Check if unique constraint exists
if psql "$DATABASE_URL" -t -c "SELECT 1 FROM pg_constraint WHERE conname='unique_pool_participant'" 2>/dev/null | grep -q 1; then
  echo -e "${YELLOW}⚠️  Constraint 'unique_pool_participant' already exists (will skip)${NC}"
else
  echo -e "${GREEN}✓ Constraint 'unique_pool_participant' does not exist (will be added)${NC}"
fi
echo ""

# Step 3: Apply migration
echo -e "${YELLOW}[3/4] Applying security fixes migration...${NC}"

if psql "$DATABASE_URL" -f "migrations/001_security_fixes.sql" > migration_output.log 2>&1; then
  echo -e "${GREEN}✅ Migration applied successfully!${NC}"

  # Show summary
  echo ""
  echo -e "${GREEN}Migration Summary:${NC}"
  grep -E "(CREATE|ALTER|INDEX)" migration_output.log || echo "  (see migration_output.log for details)"
else
  echo -e "${RED}❌ Migration failed! Check migration_output.log for details${NC}"
  exit 1
fi
echo ""

# Step 4: Verify
echo -e "${YELLOW}[4/4] Verifying migration...${NC}"

# Check used_transactions table
USED_TX_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM used_transactions" 2>/dev/null || echo "ERROR")
if [ "$USED_TX_COUNT" != "ERROR" ]; then
  echo -e "${GREEN}✅ used_transactions table exists (${USED_TX_COUNT} rows)${NC}"
else
  echo -e "${RED}❌ used_transactions table verification failed${NC}"
fi

# Check unique constraint
CONSTRAINT_EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_constraint WHERE conname='unique_pool_participant'" 2>/dev/null || echo "0")
if [ "$CONSTRAINT_EXISTS" -gt 0 ]; then
  echo -e "${GREEN}✅ unique_pool_participant constraint exists${NC}"
else
  echo -e "${RED}❌ unique_pool_participant constraint verification failed${NC}"
fi

# Check indexes
INDEX_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE tablename='used_transactions'" 2>/dev/null || echo "0")
if [ "$INDEX_COUNT" -ge 5 ]; then
  echo -e "${GREEN}✅ Indexes created (${INDEX_COUNT} indexes on used_transactions)${NC}"
else
  echo -e "${YELLOW}⚠️  Only ${INDEX_COUNT} indexes found (expected 5+)${NC}"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║    MIGRATION COMPLETED SUCCESSFULLY!                  ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

echo "Next steps:"
echo "  1. Update shared/schema.ts (see APPLY_MIGRATIONS.md)"
echo "  2. Update server/storage.ts with improved referral claim (see referral_claim_fix.ts)"
echo "  3. Restart your server: pm2 restart missout-backend"
echo "  4. Test thoroughly before deploying to production"
echo ""
echo "Backup file: $BACKUP_FILE"
echo "Migration log: migration_output.log"
echo ""

# Cleanup old logs (keep last 5)
ls -t backup_security_fixes_*.sql 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
ls -t migration_output_*.log 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true

exit 0
