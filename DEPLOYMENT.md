# 🚀 DEPLOYMENT GUIDE

## Quick Links
- **Backend (Render):** `server/` folder
- **Frontend (Vercel):** `client/` folder

---

## ✅ PRE-DEPLOYMENT CHECKLIST

### 1. Code Preparation

- [ ] All imports in `server/src/*.ts` use `.js` extensions
- [ ] All API calls in `client/src/**/*` use `VITE_API_URL`
- [ ] Environment variables configured for both environments
- [ ] TypeScript compiles without errors (`npm run check` in both folders)
- [ ] Both dev servers run locally without errors

### 2. Environment Variables Prepared

#### Backend (.env for Render)
- [ ] `DATABASE_URL` - Neon PostgreSQL connection
- [ ] `DIRECT_DATABASE_URL` - For migrations
- [ ] `REDIS_URL` - Upstash Redis
- [ ] `SOLANA_RPC_URL` - RPC endpoint
- [ ] `DEV_WALLET_PRIVATE_KEY` - Backend wallet
- [ ] `TREASURY_WALLET_PUBKEY` - Treasury address
- [ ] `SENTRY_DSN` - Error monitoring
- [ ] `FRONTEND_URL` - Your Vercel URL (update after frontend deploys)

#### Frontend (.env for Vercel)
- [ ] `VITE_API_URL` - Your Render URL (update after backend deploys)
- [ ] `VITE_SOLANA_NETWORK` - mainnet-beta or devnet
- [ ] `VITE_SOLANA_RPC_URL` - RPC endpoint

### 3. Database Ready

- [ ] Database created (Neon recommended)
- [ ] Connection string obtained
- [ ] Migrations run successfully: `cd server && npm run db:push`
- [ ] Tables created and verified

---

## 🌐 BACKEND DEPLOYMENT (Render)

### Step 1: Prepare Repository

```bash
# Commit all changes
git add .
git commit -m "chore: prepare for deployment"
git push origin main
```

### Step 2: Create Render Service

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click **"New +" → "Web Service"**
3. Connect your GitHub repository
4. Configure:

```yaml
Name: missout-backend
Region: Frankfurt (or closest to your users)
Branch: main
Root Directory: server
Runtime: Node
Build Command: npm install && npm run build
Start Command: npm start
Plan: Starter (upgrade as needed)
```

### Step 3: Add Environment Variables

In Render dashboard → Environment tab, add:

```bash
# Database (CRITICAL)
DATABASE_URL=postgresql://neondb_owner:password@host.neon.tech/neondb?sslmode=require
DIRECT_DATABASE_URL=postgresql://neondb_owner:password@host.neon.tech/neondb?sslmode=require
PGSSLMODE=require
NODE_TLS_REJECT_UNAUTHORIZED=0

# Redis (CRITICAL)
REDIS_URL=rediss://default:password@host.upstash.io:6379
REDIS_USER=default
REDIS_PASS=your_password
REDIS_TLS=true

# Solana (CRITICAL)
SOLANA_RPC_URL=https://api.devnet.solana.com
DEV_WALLET_PRIVATE_KEY=your_private_key
TREASURY_WALLET_PUBKEY=your_pubkey
SWITCHBOARD_PROGRAM_ID=Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2
SWITCHBOARD_QUEUE=EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7

# Monitoring
SENTRY_DSN=https://your_sentry_dsn@sentry.io/project

# Server
NODE_ENV=production
# PORT is auto-set by Render

# CORS - UPDATE AFTER FRONTEND DEPLOYS
FRONTEND_URL=https://your-app.vercel.app
CLIENT_URL=https://your-app.vercel.app

# Features
allowMock=false
```

### Step 4: Deploy

1. Click **"Create Web Service"**
2. Wait for build (2-5 minutes)
3. Check logs for errors
4. Verify health endpoint: `https://your-backend.onrender.com/health`

### Step 5: Verify Backend

```bash
# Health check
curl https://your-backend.onrender.com/health

# Should return:
{
  "status": "healthy",
  "timestamp": "...",
  "database": "connected",
  "redis": "connected",
  "solana": "connected"
}

# Test API endpoint
curl https://your-backend.onrender.com/api/pools
```

### Step 6: Note Backend URL

**Copy your Render URL:** `https://your-backend.onrender.com`

You'll need this for the frontend deployment.

---

## 🎨 FRONTEND DEPLOYMENT (Vercel)

### Step 1: Prepare Frontend

Ensure `client/vercel.json` exists (already created):

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

### Step 2: Create Vercel Project

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your Git repository
3. Configure:

```yaml
Framework Preset: Vite
Root Directory: client
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

### Step 3: Add Environment Variables

In Vercel dashboard → Settings → Environment Variables:

```bash
# Backend API (CRITICAL - use your Render URL)
VITE_API_URL=https://your-backend.onrender.com

# Solana
VITE_SOLANA_NETWORK=mainnet-beta
VITE_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Optional
VITE_SENTRY_DSN=your_sentry_dsn
VITE_NODE_ENV=production
```

### Step 4: Deploy

1. Click **"Deploy"**
2. Wait for build (1-3 minutes)
3. Vercel will auto-assign a URL: `https://your-app.vercel.app`

### Step 5: Verify Frontend

1. Open `https://your-app.vercel.app`
2. Check browser console for errors
3. Test wallet connection
4. Test API calls (Network tab)
5. Create a test pool
6. Join a pool

### Step 6: Update Backend CORS

**IMPORTANT:** Now that frontend is deployed, update backend environment variables:

1. Go to Render dashboard → your-backend → Environment
2. Update:
   ```bash
   FRONTEND_URL=https://your-app.vercel.app
   CLIENT_URL=https://your-app.vercel.app
   ```
3. Click **"Save Changes"**
4. Wait for auto-redeploy (or trigger manually)

---

## 🔄 POST-DEPLOYMENT VERIFICATION

### Backend Checks

- [ ] Health endpoint returns 200: `/health`
- [ ] Database connected (check logs)
- [ ] Redis connected (check logs)
- [ ] Solana RPC connected (check logs)
- [ ] API endpoints work: `/api/pools`, `/api/leaderboard`
- [ ] No errors in Render logs
- [ ] Graceful shutdown works (check logs after redeploy)

### Frontend Checks

- [ ] App loads without errors
- [ ] All pages render correctly
- [ ] Wallet adapter works (Phantom, Solflare)
- [ ] API calls successful (check Network tab)
- [ ] Pool creation works
- [ ] Pool joining works
- [ ] Leaderboard displays
- [ ] No console errors

### Integration Checks

- [ ] CORS working (no CORS errors in browser)
- [ ] API calls from frontend to backend work
- [ ] Solana transactions work end-to-end
- [ ] Database updates reflect on frontend
- [ ] Real-time updates work (if applicable)
- [ ] Error handling works (Sentry receiving errors)

---

## 🐛 TROUBLESHOOTING

### Backend Issues

#### Build Fails

**Error:** `Cannot find module`

**Fix:**
1. Check all imports have `.js` extensions
2. Verify `package.json` dependencies are correct
3. Check `tsconfig.json` paths

#### Database Connection Fails

**Error:** `ENETUNREACH` or `Connection timeout`

**Fix:**
1. Verify DATABASE_URL is correct
2. Check Neon database is running
3. Ensure `PGSSLMODE=require` is set
4. Try direct connection instead of pooled

#### Redis Connection Fails

**Error:** `ECONNREFUSED` or `Connection timeout`

**Fix:**
1. Verify REDIS_URL format: `rediss://` (with SSL)
2. Check Upstash instance is active
3. Verify credentials

#### Solana RPC Fails

**Error:** `Failed to fetch` or `429 Too Many Requests`

**Fix:**
1. Use premium RPC (Helius, QuickNode)
2. Add multiple RPC endpoints to failover
3. Check RPC_URL is correct

### Frontend Issues

#### API Calls Fail

**Error:** `Failed to fetch` or `CORS error`

**Fix:**
1. Verify `VITE_API_URL` is set correctly
2. Check backend `FRONTEND_URL` matches your Vercel domain
3. Ensure backend is running

#### Build Fails

**Error:** `Type error` or `Module not found`

**Fix:**
1. Run `npm run check` to see TypeScript errors
2. Verify all imports are correct
3. Check `tsconfig.json` paths

#### Wallet Not Connecting

**Error:** `Wallet adapter error`

**Fix:**
1. Check browser extensions (Phantom installed?)
2. Verify `VITE_SOLANA_NETWORK` matches wallet network
3. Check console for specific errors

---

## 📊 MONITORING & MAINTENANCE

### Logs

**Backend (Render):**
- View logs: Render dashboard → Logs tab
- Download logs: Click "Download logs"

**Frontend (Vercel):**
- View logs: Vercel dashboard → Deployments → Deployment logs
- Runtime logs: Functions → Logs

### Sentry Monitoring

1. Go to [sentry.io](https://sentry.io)
2. Check for errors in both frontend and backend projects
3. Set up alerts for critical errors

### Database Maintenance

```bash
# Backup database
cd server
npm run db:backup

# View database
npm run db:studio

# Run migrations
npm run db:push
```

### Redis Cache

Clear cache if needed (Upstash dashboard → Data Browser → Flush All)

---

## 🔄 REDEPLOYMENT

### Backend

**Option 1: Auto-deploy (GitHub push)**
```bash
git add .
git commit -m "feat: your changes"
git push origin main
# Render auto-deploys
```

**Option 2: Manual deploy**
1. Render dashboard → Manual Deploy → Deploy

### Frontend

**Option 1: Auto-deploy (GitHub push)**
```bash
git add .
git commit -m "feat: your changes"
git push origin main
# Vercel auto-deploys
```

**Option 2: Manual redeploy**
1. Vercel dashboard → Deployments → Redeploy

---

## 📈 SCALING

### When to Scale

**Backend:**
- High CPU usage (>80%)
- High memory usage (>80%)
- Slow response times (>2s)
- Database connection pool exhausted

**Upgrade Plan:**
1. Render: Starter → Standard → Pro
2. Increase database connections
3. Add Redis memory
4. Use premium Solana RPC

**Frontend:**
- High traffic (>10k visitors/day)
- Slow page loads

**Optimization:**
1. Enable Vercel Edge Functions
2. Add CDN caching
3. Code splitting
4. Image optimization

---

## ✅ DEPLOYMENT COMPLETE

Your Missout platform is now live! 🎉

**URLs:**
- Backend API: `https://your-backend.onrender.com`
- Frontend App: `https://your-app.vercel.app`

**Next Steps:**
1. Share with users
2. Monitor errors via Sentry
3. Check database growth
4. Monitor API usage
5. Set up backups
6. Plan feature updates

---

## 📞 SUPPORT

If you encounter issues:

1. Check deployment logs
2. Verify environment variables
3. Test locally first
4. Review [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)
5. Check [COMPREHENSIVE_PROJECT_AUDIT.md](COMPREHENSIVE_PROJECT_AUDIT.md)

---

**Deployment Time: ~30 minutes**
**Difficulty: Intermediate**
