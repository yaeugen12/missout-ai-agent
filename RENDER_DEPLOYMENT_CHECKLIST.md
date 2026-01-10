# 🚀 Render Deployment Checklist

## ✅ Fix Aplicat: Environment Variables

**Problema rezolvată:**
- ❌ Script-ul `start` folosea `--env-file=.env` care nu există în producție
- ✅ Acum production folosește environment variables din Render dashboard

**Modificări:**
```json
// package.json
"start": "NODE_ENV=production node --import tsx/esm server/index.ts"
```

```typescript
// server/index.ts
// Încarcă .env doar în development
if (process.env.NODE_ENV !== "production") {
  // load .env file
} else {
  console.log("[ENV] ✅ Production mode - using system environment variables");
}
```

---

## 📋 Render Dashboard - Environment Variables

Mergi la **Render Dashboard → Your Service → Environment** și adaugă:

### **🔐 Database (REQUIRED)**
```bash
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xaorwyhupaenqwqshanp.supabase.co:6543/postgres?pgbouncer=true&sslmode=require

DIRECT_DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xaorwyhupaenqwqshanp.supabase.co:5432/postgres?sslmode=require

PGSSLMODE=require
NODE_TLS_REJECT_UNAUTHORIZED=0
```

### **⛓️ Solana (REQUIRED)**
```bash
SOLANA_RPC_URL=https://api.devnet.solana.com

# Backend wallet (NEVER commit this!)
DEV_WALLET_PRIVATE_KEY=[YOUR_PRIVATE_KEY]

# Treasury wallet
TREASURY_WALLET_PUBKEY=J6ZDd2vQEv1LqpVTtNWpc6rH7E8A8J7V5p7YpmD9DeSG

# Switchboard
SWITCHBOARD_PROGRAM_ID=Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2
SWITCHBOARD_QUEUE=EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7
```

### **📦 Redis (REQUIRED)**
```bash
REDIS_URL=rediss://default:[PASSWORD]@flying-aphid-32808.upstash.io:6379
REDIS_USER=default
REDIS_PASS=[YOUR_REDIS_PASSWORD]
REDIS_TLS=true
```

### **🔍 Sentry (OPTIONAL)**
```bash
SENTRY_DSN=https://5d6350dbae3190553f86e74ceb61fcbb@o4510677032173568.ingest.de.sentry.io/4510677041479760
```

### **🌐 Frontend URL**
```bash
# Update after first deploy with your Render URL
CLIENT_URL=https://your-app-name.onrender.com
FRONTEND_URL=https://your-app-name.onrender.com
```

### **⚙️ Server Config**
```bash
PORT=5000
NODE_ENV=production
allowMock=false
```

---

## 🔧 Render Service Configuration

### **Build Command:**
```bash
npm install && npm run build
```

### **Start Command:**
```bash
npm start
```

### **Environment:**
- Node Version: **24.x** (latest LTS)
- Region: **Frankfurt** (EU) sau **Oregon** (US)

### **Health Check:**
- Path: `/health`
- Expected Status: `200`

### **Auto Deploy:**
- ✅ Enable Auto-Deploy from `main` branch

---

## 🧪 Pre-Deployment Tests

Înainte de deploy, testează local în modul production:

```bash
# 1. Build frontend
npm run build

# 2. Test production build local
NODE_ENV=production npm start

# 3. Verifică că serverul pornește
# Ar trebui să vezi:
# [ENV] ✅ Production mode - using system environment variables
# serving on port 5000

# 4. Test health endpoint
curl http://localhost:5000/health

# Expected:
# {
#   "status": "healthy",
#   "timestamp": "...",
#   "uptime": ...,
#   "database": "connected",
#   "redis": "connected",
#   "solana": "connected"
# }
```

---

## 🚨 Common Deployment Issues

### **Issue 1: Database Connection Failed**

**Error:**
```
[PostgreSQL] ❌ Failed to connect to database: self-signed certificate
```

**Fix:**
Verifică că ai setat în Render:
```bash
NODE_TLS_REJECT_UNAUTHORIZED=0
PGSSLMODE=require
```

---

### **Issue 2: Redis Connection Failed**

**Error:**
```
[REDIS] ❌ Connection error: getaddrinfo ENOTFOUND
```

**Fix:**
Verifică că `REDIS_URL` e corect în format:
```bash
rediss://default:[PASSWORD]@[HOST]:6379
```

---

### **Issue 3: Solana RPC Failed**

**Error:**
```
[MONITOR] ❌ Failed to initialize Solana services
```

**Fix:**
1. Verifică `SOLANA_RPC_URL` e valid
2. Verifică `DEV_WALLET_PRIVATE_KEY` e corect
3. Pentru mainnet, folosește RPC premium (Helius, QuickNode)

---

### **Issue 4: Build Fails - Out of Memory**

**Error:**
```
JavaScript heap out of memory
```

**Fix:**
În Render Dashboard → Environment, adaugă:
```bash
NODE_OPTIONS=--max-old-space-size=4096
```

---

## 📊 Post-Deployment Verification

După deployment, verifică:

### **1. Health Check**
```bash
curl https://your-app-name.onrender.com/health
```

### **2. Database Connection**
Check logs pentru:
```
✅ Database connection verified
✅ Connection pool initialized
```

### **3. Redis Connection**
```
✅ Connected to Redis successfully
```

### **4. Solana Services**
```
✅ DEV wallet loaded
✅ Anchor program initialized
✅ RPC endpoints: 1
```

### **5. Frontend Loading**
Deschide `https://your-app-name.onrender.com` în browser

---

## 🔄 Rollback Strategy

Dacă deployment-ul eșuează:

### **Option 1: Render Auto-Rollback**
Render va reveni automat la versiunea anterioară dacă health check-ul eșuează

### **Option 2: Manual Rollback**
1. Mergi la **Render Dashboard → Your Service → Events**
2. Click pe un deployment anterior care funcționa
3. Click **Redeploy**

### **Option 3: Git Revert**
```bash
git revert HEAD
git push origin main
# Render va face auto-deploy cu versiunea revertată
```

---

## 📝 Environment Variables Template

Template complet pentru copy-paste în Render:

```bash
# Database
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.xaorwyhupaenqwqshanp.supabase.co:6543/postgres?pgbouncer=true&sslmode=require
DIRECT_DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.xaorwyhupaenqwqshanp.supabase.co:5432/postgres?sslmode=require
PGSSLMODE=require
NODE_TLS_REJECT_UNAUTHORIZED=0

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
DEV_WALLET_PRIVATE_KEY=YOUR_PRIVATE_KEY
TREASURY_WALLET_PUBKEY=J6ZDd2vQEv1LqpVTtNWpc6rH7E8A8J7V5p7YpmD9DeSG
SWITCHBOARD_PROGRAM_ID=Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2
SWITCHBOARD_QUEUE=EYiAmGSdsQTuCw413V5BzaruWuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7

# Redis
REDIS_URL=rediss://default:YOUR_PASSWORD@flying-aphid-32808.upstash.io:6379
REDIS_USER=default
REDIS_PASS=YOUR_PASSWORD
REDIS_TLS=true

# Sentry (Optional)
SENTRY_DSN=https://5d6350dbae3190553f86e74ceb61fcbb@o4510677032173568.ingest.de.sentry.io/4510677041479760

# Frontend
CLIENT_URL=https://your-app-name.onrender.com
FRONTEND_URL=https://your-app-name.onrender.com

# Server
PORT=5000
NODE_ENV=production
allowMock=false
```

---

## ✅ Final Checklist

Înainte de primul deploy:

- [ ] Toate environment variables setate în Render Dashboard
- [ ] `NODE_ENV=production` setat
- [ ] DATABASE_URL și DIRECT_DATABASE_URL configurate
- [ ] Redis credentials setate
- [ ] DEV_WALLET_PRIVATE_KEY setat (NEVER commit in git!)
- [ ] Build command: `npm install && npm run build`
- [ ] Start command: `npm start`
- [ ] Health check path: `/health`
- [ ] Auto-deploy enabled
- [ ] Git push la `main` branch

După primul deploy:

- [ ] Health check returns 200
- [ ] Database connected (check logs)
- [ ] Redis connected (check logs)
- [ ] Solana services initialized (check logs)
- [ ] Frontend loads în browser
- [ ] No errors în Render logs
- [ ] Update `CLIENT_URL` cu URL-ul real Render

---

**Status:** ✅ Ready for Production Deployment
**Last Updated:** 2026-01-10
