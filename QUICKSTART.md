# MissOut - Quick Start Guide

Get your production-ready Solana lottery platform running in 15 minutes.

---

## Prerequisites Checklist

- [ ] Node.js 20+ installed
- [ ] PostgreSQL client (`psql`) installed
- [ ] Supabase account (https://supabase.com) OR Railway/Render
- [ ] Helius account for Solana RPC (https://helius.dev)

---

## 1. Database Setup (Supabase - Recommended)

### Create Database

1. Go to https://supabase.com/dashboard/projects
2. Click **New Project**
3. Fill in:
   - Name: `missout-production`
   - Database Password: (generate strong password - save it!)
   - Region: `us-east-1` (or closest to you)
4. Wait 2-3 minutes for provisioning

### Get Connection Strings

Go to **Settings** > **Database** > **Connection string**

Copy **BOTH**:

```bash
# Pooled (port 6543) - for application
DATABASE_URL="postgresql://postgres.xxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Direct (port 5432) - for migrations
DIRECT_DATABASE_URL="postgresql://postgres.xxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
```

---

## 2. Clone & Install

```bash
# Clone repository
git clone https://github.com/your-org/missout.git
cd missout

# Install dependencies
npm install
```

---

## 3. Configure Environment

```bash
# Copy example file
cp .env.example .env

# Edit with your values
nano .env
```

### Minimal .env for Testing:

```env
# === DATABASE (REQUIRED) ===
DATABASE_URL=postgresql://postgres.xxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_DATABASE_URL=postgresql://postgres.xxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres

# === SOLANA DEVNET (for testing) ===
SOLANA_RPC_URL=https://api.devnet.solana.com
DEV_WALLET_PRIVATE_KEY=<generate_with_solana-keygen>
TREASURY_WALLET_PUBKEY=<your_devnet_wallet>

# === SWITCHBOARD DEVNET ===
SWITCHBOARD_PROGRAM_ID=Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2
SWITCHBOARD_QUEUE=EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7

# === SERVER ===
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:3000
allowMock=1
```

### Generate Solana Wallet:

```bash
# Generate backend wallet
solana-keygen new -o backend-wallet.json

# Convert to base58 (copy output)
node -e "console.log(require('bs58').encode(Buffer.from(JSON.parse(require('fs').readFileSync('backend-wallet.json')))))"

# Get public key
solana-keygen pubkey backend-wallet.json

# Fund devnet wallet (2 SOL)
solana airdrop 2 $(solana-keygen pubkey backend-wallet.json) --url devnet
```

---

## 4. Run Migrations

```bash
# Export database URL
export DIRECT_DATABASE_URL="postgresql://..."

# Run migration script
npm run db:migrate
```

Expected output:

```
✅ Backup created: backup_20260108_123456.sql
✅ Database connection successful
✅ Drizzle schema applied successfully
✅ Applied: migrations/001_security_fixes.sql
✅ All 9 tables found
✅ Performance indexes created (30+ indexes)
```

Verify:

```bash
# Test connection
npm run db:test

# Expected output:
#          now
# ------------------------
#  2026-01-08 12:34:56+00
```

---

## 5. Start Backend

```bash
# Development mode (with hot reload)
npm run dev
```

Expected output:

```
[PostgreSQL] ✅ Database connection verified at 2026-01-08T12:34:56.789Z
[PostgreSQL] Connection pool initialized: { max: 10, min: 2, idleTimeout: '30000ms', pgBouncer: true }
[Pool Monitor] ✅ Pool monitor started (polling every 5000ms)
Server running on port 5000
```

### Test Health Endpoint:

```bash
curl http://localhost:5000/health
```

Expected response:

```json
{
  "status": "healthy",
  "database": "connected",
  "poolMonitor": {
    "running": true,
    "processingCount": 0
  }
}
```

---

## 6. Start Frontend (Optional)

```bash
# In new terminal
cd client

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open http://localhost:3000

---

## 7. Test Full Lifecycle

### Create Test Pool:

1. Go to http://localhost:3000
2. Connect wallet (Phantom/Solflare)
3. Create pool:
   - Token: SOL
   - Entry: 0.01 SOL
   - Max participants: 2
4. Backend should log:

```
[POOL CREATE] ✅ Verified on-chain pool: { txHash: '...', poolAddress: '...' }
```

### Join Pool:

1. Join with second wallet
2. Pool should auto-lock when full
3. Check pool monitor logs:

```
[Pool Monitor] Processing pool 1 (status: locked)
[Pool Monitor] Attempting to unlock pool...
```

### Check Database:

```bash
psql $DATABASE_URL -c "SELECT id, status, pool_address FROM pools;"
```

---

## 8. Production Deployment

### Deploy Backend to Railway:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link project
railway link

# Add environment variables
railway variables set DATABASE_URL="postgresql://..."
railway variables set SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=..."

# Deploy
railway up
```

### Deploy Frontend to Vercel:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd client
vercel --prod
```

See [PRODUCTION_DEPLOYMENT_GUIDE.md](PRODUCTION_DEPLOYMENT_GUIDE.md) for complete instructions.

---

## Useful Commands

```bash
# Database
npm run db:push           # Apply Drizzle schema changes
npm run db:studio         # Open Drizzle Studio (database GUI)
npm run db:migrate        # Run all migrations
npm run db:test           # Test database connection
npm run db:backup         # Create database backup

# Development
npm run dev               # Start dev server
npm run build             # Build for production
npm run start             # Start production server
npm run check             # Type check

# Production (PM2)
npm run pm2:start         # Start with PM2
npm run pm2:stop          # Stop PM2 process
npm run pm2:restart       # Restart PM2 process
npm run pm2:logs          # View PM2 logs
npm run pm2:monit         # Monitor PM2 process

# Health Check
npm run health            # Check server health (requires jq)
curl http://localhost:5000/health
```

---

## Troubleshooting

### Error: "DATABASE_URL must be set"

```bash
# Make sure .env is loaded
source .env

# Or export manually
export DATABASE_URL="postgresql://..."
export DIRECT_DATABASE_URL="postgresql://..."
```

### Error: "Connection refused"

Database not running or wrong credentials.

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1;"

# Check Supabase dashboard
# Settings > Database > Connection pooler should be "Active"
```

### Error: "too many connections"

Not using pgBouncer pooled connection.

```bash
# Make sure DATABASE_URL includes pgbouncer=true
DATABASE_URL="postgresql://...?pgbouncer=true"

# Or use port 6543 (Supabase)
DATABASE_URL="postgresql://...pooler.supabase.com:6543/postgres"
```

### Pool Monitor Not Processing

```bash
# Check logs
npm run pm2:logs

# Check database
psql $DATABASE_URL -c "SELECT id, status FROM pools WHERE status != 'ended';"

# Restart pool monitor
npm run pm2:restart
```

---

## Project Structure

```
missout/
├── server/                 # Backend API
│   ├── index.ts           # Server entry point
│   ├── db.ts              # PostgreSQL + pgBouncer config
│   ├── routes.ts          # API endpoints
│   ├── storage.ts         # Database abstraction layer
│   └── pool-monitor/      # Automated pool lifecycle
├── client/                # React frontend
│   └── src/
│       ├── lib/solana-sdk/ # Custom Solana SDK
│       └── pages/         # React pages
├── shared/                # Shared code
│   ├── schema.ts          # Drizzle ORM schema
│   └── routes.ts          # API route definitions
├── migrations/            # Database migrations
│   ├── 001_security_fixes.sql
│   └── apply.sh
├── scripts/               # Utility scripts
│   └── migrate-database.sh
├── drizzle.config.ts      # Drizzle configuration
├── .env                   # Environment variables (git-ignored)
└── .env.example           # Environment template
```

---

## Next Steps

1. [ ] Test full pool lifecycle (create → join → lock → randomness → payout)
2. [ ] Configure mainnet environment variables
3. [ ] Deploy smart contract to mainnet
4. [ ] Deploy backend to Railway/Render
5. [ ] Deploy frontend to Vercel
6. [ ] Set up monitoring (Sentry)
7. [ ] Configure Redis cache (optional)

---

## Support

- **Full Deployment Guide**: See [PRODUCTION_DEPLOYMENT_GUIDE.md](PRODUCTION_DEPLOYMENT_GUIDE.md)
- **Security Migrations**: See [migrations/APPLY_MIGRATIONS.md](migrations/APPLY_MIGRATIONS.md)
- **Environment Variables**: See [.env.example](.env.example)

---

**You're all set! 🚀**

If you encounter issues, check the troubleshooting section or open an issue on GitHub.
