#!/bin/bash

###############################################################################
# Database Migration Script for Production PostgreSQL
# Applies all schema changes using DIRECT_DATABASE_URL (bypasses pgBouncer)
###############################################################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    MISSOUT DATABASE MIGRATION                         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if DIRECT_DATABASE_URL is set
if [ -z "$DIRECT_DATABASE_URL" ]; then
  echo -e "${YELLOW}⚠️  DIRECT_DATABASE_URL not set, trying DATABASE_URL...${NC}"

  if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}❌ ERROR: No database URL found${NC}"
    echo ""
    echo "Set DIRECT_DATABASE_URL for migrations (bypasses pgBouncer):"
    echo "  export DIRECT_DATABASE_URL='postgresql://user:pass@host:5432/db'"
    echo ""
    echo "Or source your .env file:"
    echo "  source .env"
    exit 1
  fi

  MIGRATION_URL="$DATABASE_URL"
  echo -e "${YELLOW}Using DATABASE_URL for migrations${NC}"
else
  MIGRATION_URL="$DIRECT_DATABASE_URL"
  echo -e "${GREEN}Using DIRECT_DATABASE_URL for migrations (recommended)${NC}"
fi

# Remove password from display URL
DISPLAY_URL=$(echo "$MIGRATION_URL" | sed -E 's/:\/\/([^:]+):[^@]+@/:\/\/\1:****@/')
echo -e "${BLUE}Database: ${DISPLAY_URL}${NC}"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
  echo -e "${RED}❌ psql not found. Install PostgreSQL client:${NC}"
  echo "  Ubuntu: sudo apt-get install postgresql-client"
  echo "  macOS: brew install postgresql"
  exit 1
fi

# Create backup
echo -e "${YELLOW}[1/5] Creating database backup...${NC}"
BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"

if pg_dump "$MIGRATION_URL" > "$BACKUP_FILE" 2>/dev/null; then
  echo -e "${GREEN}✅ Backup created: $BACKUP_FILE${NC}"
else
  echo -e "${YELLOW}⚠️  Backup failed (database may not exist yet)${NC}"
fi
echo ""

# Test connection
echo -e "${YELLOW}[2/5] Testing database connection...${NC}"
if psql "$MIGRATION_URL" -c "SELECT version();" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Database connection successful${NC}"
  DB_VERSION=$(psql "$MIGRATION_URL" -t -c "SELECT version();" | head -1 | xargs)
  echo -e "${BLUE}$DB_VERSION${NC}"
else
  echo -e "${RED}❌ Failed to connect to database${NC}"
  echo "Check your connection string and ensure:"
  echo "  1. Database server is running"
  echo "  2. Credentials are correct"
  echo "  3. Network access is allowed"
  exit 1
fi
echo ""

# Apply Drizzle schema
echo -e "${YELLOW}[3/5] Applying Drizzle schema (drizzle-kit push)...${NC}"
if npm run db:push 2>&1 | tee drizzle_push.log; then
  echo -e "${GREEN}✅ Drizzle schema applied successfully${NC}"
else
  echo -e "${RED}❌ Drizzle schema push failed. Check drizzle_push.log${NC}"
  exit 1
fi
echo ""

# Apply manual migrations
echo -e "${YELLOW}[4/5] Applying manual SQL migrations...${NC}"

MIGRATIONS=(
  "migrations/001_security_fixes.sql"
  "migrations/add_claim_tracking.sql"
  "drizzle/migrations/0001_add_performance_indexes.sql"
)

for migration in "${MIGRATIONS[@]}"; do
  if [ -f "$migration" ]; then
    echo -e "${BLUE}  Applying: $migration${NC}"
    if psql "$MIGRATION_URL" -f "$migration" > /dev/null 2>&1; then
      echo -e "${GREEN}  ✅ Applied: $migration${NC}"
    else
      echo -e "${YELLOW}  ⚠️  Warning: $migration may have failed or already applied${NC}"
    fi
  else
    echo -e "${YELLOW}  ⚠️  Not found: $migration (skipping)${NC}"
  fi
done
echo ""

# Verify schema
echo -e "${YELLOW}[5/5] Verifying database schema...${NC}"

# Check tables
echo -e "${BLUE}Checking tables...${NC}"
TABLES=$(psql "$MIGRATION_URL" -t -c "
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema='public'
  ORDER BY table_name;
" | xargs)

EXPECTED_TABLES="participants pools profiles referral_claims referral_relations referral_reward_events referral_rewards transactions used_transactions"
FOUND_COUNT=$(echo "$TABLES" | wc -w)
EXPECTED_COUNT=$(echo "$EXPECTED_TABLES" | wc -w)

if [ "$FOUND_COUNT" -eq "$EXPECTED_COUNT" ]; then
  echo -e "${GREEN}✅ All $EXPECTED_COUNT tables found${NC}"
  echo -e "${BLUE}Tables: $TABLES${NC}"
else
  echo -e "${YELLOW}⚠️  Found $FOUND_COUNT tables (expected $EXPECTED_COUNT)${NC}"
  echo -e "${BLUE}Found: $TABLES${NC}"
  echo -e "${YELLOW}Expected: $EXPECTED_TABLES${NC}"
fi
echo ""

# Check indexes
echo -e "${BLUE}Checking indexes...${NC}"
INDEX_COUNT=$(psql "$MIGRATION_URL" -t -c "
  SELECT COUNT(*)
  FROM pg_indexes
  WHERE schemaname='public';
")

if [ "$INDEX_COUNT" -gt 30 ]; then
  echo -e "${GREEN}✅ Performance indexes created ($INDEX_COUNT indexes)${NC}"
else
  echo -e "${YELLOW}⚠️  Only $INDEX_COUNT indexes found (expected 30+)${NC}"
fi
echo ""

# Show table sizes
echo -e "${BLUE}Table sizes:${NC}"
psql "$MIGRATION_URL" -c "
  SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
  FROM pg_tables
  WHERE schemaname='public'
  ORDER BY size_bytes DESC;
"
echo ""

echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║    MIGRATION COMPLETED SUCCESSFULLY!                  ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

echo "Next steps:"
echo "  1. Verify tables: psql \$MIGRATION_URL -c '\\dt'"
echo "  2. Start application with DATABASE_URL (pooled connection)"
echo "  3. Test health endpoint: curl http://localhost:5000/health"
echo ""
echo "Backup file: $BACKUP_FILE"
echo ""

exit 0
