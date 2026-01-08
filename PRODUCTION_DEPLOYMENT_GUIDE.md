# MissOut Production Deployment Guide

Complete guide for deploying MissOut to production with PostgreSQL + pgBouncer connection pooling.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Database Setup (Supabase)](#database-setup-supabase)
4. [Database Setup (Railway)](#database-setup-railway)
5. [Database Setup (Render)](#database-setup-render)
6. [Local Development Setup](#local-development-setup)
7. [Running Migrations](#running-migrations)
8. [Backend Deployment](#backend-deployment)
9. [Frontend Deployment](#frontend-deployment)
10. [Pool Monitor Setup](#pool-monitor-setup)
11. [Monitoring & Health Checks](#monitoring--health-checks)
12. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────┐         ┌──────────────────┐
│   Frontend      │────────▶│   Backend API    │
│   (Vercel)      │         │   (Railway)      │
└─────────────────┘         └────────┬─────────┘
                                     │
                            ┌────────┴─────────┐
                            │                  │
                      ┌─────▼──────┐    ┌─────▼──────┐
                      │ pgBouncer  │    │ Pool       │
                      │ (port 6543)│    │ Monitor    │
                      └─────┬──────┘    │ (PM2)      │
                            │           └─────┬──────┘
                      ┌─────▼─────────────────▼──────┐
                      │   PostgreSQL Database        │
                      │   (Supabase/Railway/Render)  │
                      └──────────────────────────────┘
```

### Key Components:

- **Frontend**: React + Vite (deployed on Vercel)
- **Backend**: Express + TypeScript (deployed on Railway/Render)
- **Database**: PostgreSQL with pgBouncer connection pooling
- **Pool Monitor**: Long-running process that manages pool lifecycle
- **Cache**: Redis (optional, recommended for production)

---

## Prerequisites

### Required Tools:

```bash
# Node.js 20+
node --version  # v20.x.x

# npm or pnpm
npm --version   # 10.x.x

# PostgreSQL client (for migrations)
psql --version  # 14.x or higher

# Git
git --version

# Solana CLI (optional, for wallet generation)
solana --version
```

### Required Accounts:

- [ ] Supabase account (https://supabase.com) OR Railway/Render
- [ ] Vercel account (https://vercel.com) for frontend
- [ ] GitHub repository (for CI/CD)
- [ ] Helius account (https://helius.dev) for Solana RPC
- [ ] (Optional) Sentry account for error tracking

---

## Database Setup (Supabase)

**Recommended for production - includes built-in pgBouncer**

### Step 1: Create Project

1. Go to https://supabase.com/dashboard/projects
2. Click "New Project"
3. Fill in:
   - **Name**: missout-production
   - **Database Password**: (generate strong password - save it!)
   - **Region**: Choose closest to your users (e.g., us-east-1)
   - **Pricing Plan**: Free tier OK for testing, Pro for production

### Step 2: Get Connection Strings

1. Go to **Settings** > **Database**
2. Find **Connection string** section
3. Copy **TWO connection strings**:

#### Pooled Connection (for application):
```
postgresql://postgres.xxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```
**Port 6543** = pgBouncer (transaction mode)

#### Direct Connection (for migrations):
```
postgresql://postgres.xxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```
**Port 5432** = Direct PostgreSQL

### Step 3: Configure Environment Variables

Create `.env` file:

```env
# Pooled (with pgBouncer) - for application
DATABASE_URL=postgresql://postgres.xxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# Direct - for migrations
DIRECT_DATABASE_URL=postgresql://postgres.xxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

### Step 4: Allow Network Access

1. Go to **Settings** > **Database** > **Network Restrictions**
2. For development: Allow all IPs (0.0.0.0/0)
3. For production: Whitelist specific IPs or use private networking

---

## Database Setup (Railway)

**Alternative to Supabase**

### Step 1: Create PostgreSQL Database

1. Go to https://railway.app/new
2. Click "Provision PostgreSQL"
3. Wait for provisioning (~30 seconds)

### Step 2: Get Connection String

1. Click on PostgreSQL service
2. Go to **Variables** tab
3. Copy `DATABASE_URL`

**Note**: Railway doesn't include pgBouncer by default. Options:

**Option A**: Use Supabase's connection pooler
- Create free Supabase project (only for database)
- Use Supabase's pgBouncer endpoint
- Configure to connect to Railway database

**Option B**: Add pgBouncer manually
```bash
# In Railway project, add pgBouncer service
railway service create
railway service add postgres-pgbouncer

# Configure pgBouncer (see pgBouncer section below)
```

**Option C**: Skip pgBouncer for small-scale deployments
```env
DATABASE_URL=postgresql://postgres:xxx@containers-us-west-xxx.railway.app:5432/railway
DIRECT_DATABASE_URL=postgresql://postgres:xxx@containers-us-west-xxx.railway.app:5432/railway
```

---

## Database Setup (Render)

**Alternative to Supabase/Railway**

### Step 1: Create PostgreSQL Database

1. Go to https://dashboard.render.com/new/database
2. Fill in:
   - **Name**: missout-postgres
   - **Database**: missout
   - **User**: missout_user
   - **Region**: Oregon (US West) or closest region
   - **Plan**: Free tier OK for testing

### Step 2: Get Connection String

1. Go to database dashboard
2. Copy **Internal Database URL** (for production)
3. Use **External Database URL** (for local development/migrations)

```env
# Internal (from Render backend only)
DATABASE_URL=postgresql://missout_user:xxx@dpg-xxx-a.oregon-postgres.render.com:5432/missout

# External (for migrations from local machine)
DIRECT_DATABASE_URL=postgresql://missout_user:xxx@dpg-xxx-a.oregon-postgres.render.com:5432/missout
```

---

## Local Development Setup

### Step 1: Clone Repository

```bash
git clone https://github.com/your-org/missout.git
cd missout
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment

```bash
# Copy example file
cp .env.example .env

# Edit .env with your values
nano .env
```

Required variables for local development:

```env
# Database (use Supabase/Railway/Render connection string)
DATABASE_URL=postgresql://...
DIRECT_DATABASE_URL=postgresql://...

# Solana (Devnet for testing)
SOLANA_RPC_URL=https://api.devnet.solana.com
DEV_WALLET_PRIVATE_KEY=<generate_new_keypair>
TREASURY_WALLET_PUBKEY=<your_devnet_wallet>

# Switchboard (Devnet)
SWITCHBOARD_PROGRAM_ID=Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2
SWITCHBOARD_QUEUE=EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7

# Server
NODE_ENV=development
PORT=5000
allowMock=1
```

### Step 4: Generate Solana Wallets (if needed)

```bash
# Generate backend wallet
solana-keygen new -o backend-wallet.json

# Get public key
solana-keygen pubkey backend-wallet.json

# Convert to base58 (for DEV_WALLET_PRIVATE_KEY)
node -e "console.log(require('bs58').encode(Buffer.from(JSON.parse(require('fs').readFileSync('backend-wallet.json')))))"

# Fund devnet wallet
solana airdrop 2 <PUBKEY> --url devnet
```

---

## Running Migrations

### Step 1: Test Database Connection

```bash
# Test connection
psql $DIRECT_DATABASE_URL -c "SELECT NOW();"
```

### Step 2: Run Migration Script

```bash
# Make script executable (if not already)
chmod +x scripts/migrate-database.sh

# Run migrations
export DIRECT_DATABASE_URL="postgresql://..."
./scripts/migrate-database.sh
```

### Step 3: Verify Schema

```bash
# List all tables
psql $DIRECT_DATABASE_URL -c "\dt"

# Should show:
# - participants
# - pools
# - profiles
# - referral_claims
# - referral_relations
# - referral_reward_events
# - referral_rewards
# - transactions
# - used_transactions

# Check table counts
psql $DIRECT_DATABASE_URL -c "
  SELECT schemaname, tablename, pg_total_relation_size(schemaname||'.'||tablename) as size
  FROM pg_tables
  WHERE schemaname='public'
  ORDER BY size DESC;
"
```

---

## Backend Deployment

### Option A: Deploy to Railway

#### Step 1: Connect Repository

1. Go to https://railway.app/new
2. Click "Deploy from GitHub repo"
3. Select your repository
4. Railway will auto-detect Node.js project

#### Step 2: Configure Build Settings

Railway auto-detects, but verify:

- **Build Command**: `npm run build`
- **Start Command**: `npm run start`
- **Root Directory**: `/` (or `/missout` if in monorepo)

#### Step 3: Add Environment Variables

Go to **Variables** tab and add:

```env
NODE_ENV=production
PORT=5000

# Database (from Railway PostgreSQL or Supabase)
DATABASE_URL=postgresql://...?pgbouncer=true
DIRECT_DATABASE_URL=postgresql://...

# Solana Mainnet
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
DEV_WALLET_PRIVATE_KEY=<production_wallet_base58>
TREASURY_WALLET_PUBKEY=<your_treasury_pubkey>

# Switchboard Mainnet
SWITCHBOARD_PROGRAM_ID=SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv
SWITCHBOARD_QUEUE=<mainnet_queue_pubkey>

# Frontend URL
FRONTEND_URL=https://your-frontend.vercel.app

# Optional
REDIS_URL=redis://...
SENTRY_DSN=https://...
HELIUS_API_KEY=...
```

#### Step 4: Deploy

```bash
# Railway will auto-deploy on git push
git push origin main

# Or use Railway CLI
railway up
```

#### Step 5: Run Migrations

```bash
# Using Railway CLI
railway run ./scripts/migrate-database.sh

# Or SSH into container
railway shell
npm run db:push
```

### Option B: Deploy to Render

#### Step 1: Create Web Service

1. Go to https://dashboard.render.com/new/web
2. Connect GitHub repository
3. Fill in:
   - **Name**: missout-backend
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Plan**: Starter ($7/month) or Free tier

#### Step 2: Add Environment Variables

Same as Railway above.

#### Step 3: Deploy

Render auto-deploys on push to main branch.

---

## Frontend Deployment

### Step 1: Update Frontend Environment

Create `client/.env.production`:

```env
VITE_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
VITE_SOLANA_CLUSTER=mainnet-beta
VITE_SWITCHBOARD_QUEUE=<MAINNET_QUEUE_PUBKEY>
VITE_SWITCHBOARD_PROGRAM_ID=SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv
VITE_API_URL=https://your-backend.railway.app
```

### Step 2: Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Navigate to client directory
cd client

# Deploy
vercel --prod
```

Or use Vercel Dashboard:

1. Go to https://vercel.com/new
2. Import repository
3. Configure:
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add environment variables (from .env.production)
5. Deploy

### Step 3: Update Backend CORS

Add Vercel URL to `FRONTEND_URL` in backend environment variables.

---

## Pool Monitor Setup

The pool monitor is a long-running process that manages pool lifecycle.

### Option 1: Run with PM2 (Recommended for Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start pool monitor
pm2 start npm --name "missout-backend" -- start

# Enable auto-restart on server reboot
pm2 startup
pm2 save

# Monitor logs
pm2 logs missout-backend

# Check status
pm2 status
```

### Option 2: Run as Systemd Service (Linux)

Create `/etc/systemd/system/missout.service`:

```ini
[Unit]
Description=MissOut Backend + Pool Monitor
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/home/nodejs/missout
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=missout

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable missout
sudo systemctl start missout
sudo systemctl status missout
```

### Option 3: Railway/Render (Automatic)

Railway and Render run the start command automatically with process management.

---

## Monitoring & Health Checks

### Health Endpoint

```bash
curl https://your-backend.railway.app/health
```

Expected response:

```json
{
  "status": "healthy",
  "database": "connected",
  "poolMonitor": {
    "running": true,
    "processingCount": 0
  },
  "uptime": 12345,
  "version": "1.0.0"
}
```

### Database Health

```bash
curl https://your-backend.railway.app/health/database
```

Expected response:

```json
{
  "healthy": true,
  "latency": 15,
  "poolStats": {
    "total": 5,
    "idle": 3,
    "waiting": 0
  }
}
```

### Sentry Integration (Optional)

```bash
# Install Sentry
npm install @sentry/node

# Add to server/index.ts
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}
```

---

## Troubleshooting

### Issue: "DATABASE_URL must be set"

**Solution**: Add DATABASE_URL to environment variables

```bash
export DATABASE_URL="postgresql://..."
```

### Issue: "Connection timeout"

**Causes**:
- Database not running
- Firewall blocking connection
- Wrong credentials

**Solution**:
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1;"

# Check firewall (Supabase)
# Settings > Database > Network Restrictions > Allow IP
```

### Issue: "too many connections"

**Causes**:
- Not using pgBouncer
- Connection leak in code
- Pool size too large

**Solution**:
```bash
# Use pgBouncer connection string
DATABASE_URL="postgresql://...?pgbouncer=true"

# Reduce pool size in db.ts
max: 10  # Instead of 20
```

### Issue: "prepared statement already exists"

**Cause**: Using pgBouncer for migrations

**Solution**: Use DIRECT_DATABASE_URL for migrations

```bash
export DIRECT_DATABASE_URL="postgresql://...port:5432..."
npm run db:push
```

### Issue: Pool monitor not processing pools

**Check**:
```bash
# Check logs
pm2 logs missout-backend

# Check database connection
curl http://localhost:5000/health

# Check pool status
psql $DATABASE_URL -c "SELECT id, status, pool_address FROM pools WHERE status != 'ended';"
```

### Issue: "ECONNREFUSED" when connecting to database

**Causes**:
- Database service not running
- Wrong host/port
- Network restrictions

**Solution**:
```bash
# Verify database is running
psql $DATABASE_URL -c "SELECT NOW();"

# Check connection string format
# Should be: postgresql://user:pass@host:port/database
```

---

## Production Checklist

Before going live:

### Database

- [ ] PostgreSQL database provisioned (Supabase/Railway/Render)
- [ ] pgBouncer connection pooling configured
- [ ] Migrations applied successfully
- [ ] All tables created (9 tables)
- [ ] Performance indexes created (30+ indexes)
- [ ] Backup strategy configured

### Backend

- [ ] Environment variables set (DATABASE_URL, SOLANA_RPC_URL, etc.)
- [ ] Backend deployed to Railway/Render
- [ ] Health endpoint returns "healthy"
- [ ] Pool monitor running (PM2 or systemd)
- [ ] CORS configured for frontend domain
- [ ] Rate limiting enabled
- [ ] Error tracking (Sentry) configured

### Frontend

- [ ] Deployed to Vercel
- [ ] Environment variables set (VITE_API_URL, etc.)
- [ ] Mainnet RPC configured (Helius/QuickNode)
- [ ] Switchboard mainnet IDs updated
- [ ] Smart contract deployed to mainnet
- [ ] Test transactions successful

### Security

- [ ] New production wallet generated (DEV_WALLET_PRIVATE_KEY)
- [ ] Production wallet funded (2-5 SOL)
- [ ] Private keys stored securely (not in git)
- [ ] SSL/TLS enabled on all endpoints
- [ ] Database access restricted to backend IPs
- [ ] Session secret generated (32+ characters)

### Monitoring

- [ ] Health checks configured
- [ ] Error tracking (Sentry) working
- [ ] Database query monitoring
- [ ] RPC usage monitoring (Helius dashboard)
- [ ] Uptime monitoring (UptimeRobot/Pingdom)

### Testing

- [ ] Create pool → Success
- [ ] Join pool → Success
- [ ] Pool locks automatically → Success
- [ ] Randomness request → Success
- [ ] Winner selection → Success
- [ ] Payout → Success
- [ ] Refunds work → Success
- [ ] Referral rewards work → Success

---

## Support & Resources

- **Documentation**: See `README.md`
- **Database Migrations**: See `migrations/APPLY_MIGRATIONS.md`
- **Security Fixes**: See `migrations/001_security_fixes.sql`
- **Drizzle ORM Docs**: https://orm.drizzle.team/docs/overview
- **Supabase Docs**: https://supabase.com/docs/guides/database
- **Railway Docs**: https://docs.railway.app/
- **Render Docs**: https://render.com/docs

---

## Estimated Costs (Monthly)

| Service | Free Tier | Paid Plan |
|---------|-----------|-----------|
| **Supabase** | 500MB, unlimited API requests | $25/month (8GB) |
| **Railway** | $5 credit | ~$10-20/month |
| **Render** | Free tier available | $7/month (Starter) |
| **Vercel** | 100GB bandwidth | Free for hobby |
| **Helius RPC** | 100k credits/month | $99/month (Pro) |
| **Redis (Upstash)** | 10k commands/day | $10/month |
| **Total** | **~$0-15/month** | **~$50-100/month** |

---

**Deployment complete! 🚀**

For questions or issues, check the troubleshooting section or open an issue on GitHub.
