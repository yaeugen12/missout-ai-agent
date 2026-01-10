# ⚡ QUICK START GUIDE

## 🎯 For Developers Who Want to Get Running FAST

### 1. One-Line Migration

```bash
chmod +x migrate.sh && ./migrate.sh
```

### 2. Create Environment Files

**Backend (`server/.env`):**
```bash
DATABASE_URL=your_neon_url
REDIS_URL=your_upstash_url
SOLANA_RPC_URL=https://api.devnet.solana.com
DEV_WALLET_PRIVATE_KEY=your_key
FRONTEND_URL=http://localhost:5173
```

**Frontend (`client/.env`):**
```bash
VITE_API_URL=http://localhost:5000
VITE_SOLANA_NETWORK=devnet
```

### 3. Fix Imports (Critical!)

**Backend - Add `.js` to imports:**
```typescript
// Change this:
import { something } from "./file";

// To this:
import { something } from "./file.js";
```

**Frontend - Use API client:**
```typescript
// Change this:
fetch('/api/pools')

// To this:
import { api } from '@/lib/api-client';
api.get('/api/pools')
```

### 4. Run Dev Servers

```bash
# Terminal 1
cd server && npm install && npm run dev

# Terminal 2
cd client && npm install && npm run dev
```

### 5. Deploy

**Backend (Render):**
- Root: `server`
- Build: `npm install && npm run build`
- Start: `npm start`

**Frontend (Vercel):**
- Root: `client`
- Framework: Vite
- Build: `npm run build`

---

## 🔥 Common Commands

```bash
# Development
npm run dev              # Run both (from root)
cd server && npm run dev # Backend only
cd client && npm run dev # Frontend only

# Production Build
npm run build            # Build both (from root)

# Database
cd server
npm run db:push          # Run migrations
npm run db:studio        # Open Drizzle Studio

# Health Check
curl http://localhost:5000/health
```

---

## 📁 Key Files to Update

### Must Update (Backend)
- [ ] `server/src/index.ts` - Remove Vite, add CORS
- [ ] `server/src/routes.ts` - Add `.js` to imports
- [ ] `server/src/storage.ts` - Add `.js` to imports
- [ ] `server/src/pool-monitor/poolMonitor.ts` - Add `.js`

### Must Update (Frontend)
- [ ] `client/src/lib/api-client.ts` - Create this file
- [ ] All files making API calls - Use api client

---

## ✅ Quick Verification

```bash
# Backend works?
curl http://localhost:5000/health

# Frontend works?
open http://localhost:5173

# API calls work?
# Open browser console, check Network tab for calls to localhost:5000
```

---

## 🆘 Quick Fixes

**"Cannot find module"** → Add `.js` to import

**"CORS error"** → Set `FRONTEND_URL` in backend `.env`

**"API not found"** → Set `VITE_API_URL` in client `.env`

**"Database error"** → Check `DATABASE_URL` in server `.env`

---

## 📚 Full Documentation

- **README.md** - Complete overview
- **MIGRATION_GUIDE.md** - Detailed steps
- **DEPLOYMENT.md** - Production deployment
- **RESTRUCTURE_COMPLETE.md** - What changed

---

**Time to get running:** 30 minutes
**Time to deploy:** 30 minutes
