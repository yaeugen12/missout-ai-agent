# 🚀 MIGRATION GUIDE - Split Monorepo Structure

## 📋 Overview

This project has been restructured from a single Replit-based app into a **clean split monorepo** with separate backend and frontend deployments.

```
Old Structure:          New Structure:
missout/               missout/
├── server/            ├── server/          ← Backend (Render)
├── client/            │   ├── src/
├── shared/            │   ├── package.json
├── package.json       │   └── tsconfig.json
└── ...                ├── client/          ← Frontend (Vercel)
                       │   ├── src/
                       │   ├── package.json
                       │   └── tsconfig.json
                       ├── shared/          ← Shared types
                       └── package.json     ← Root (optional)
```

---

## 🔧 STEP 1: File Migration

### Move Backend Files

All backend files need to move into `server/src/`:

```bash
# From project root
cd missout

# Move all server files to server/src/
mv server/*.ts server/src/
mv server/pool-monitor server/src/
mv server/replit_integrations server/src/
mv server/ml server/src/

# Move drizzle config
cp drizzle.config.ts server/
```

### Move Frontend Files

All frontend files are already in `client/`, just verify structure:

```bash
# Client structure should be:
client/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   └── pages/
├── public/
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### Move Shared Files

```bash
# Move shared types to shared/
mv shared/ ./
# shared/ should contain:
# - routes.ts
# - schema.ts
```

---

## 🔧 STEP 2: Fix Import Paths

### Backend Import Fixes

**In ALL server files**, update imports:

**Before:**
```typescript
import { something } from "./file";
import { shared } from "@shared/routes";
```

**After:**
```typescript
import { something } from "./file.js";  // Add .js extension for ESM
import { shared } from "@shared/routes";  // Keep @shared alias
```

**Critical files to update:**
- `server/src/index.ts` - Main entry point
- `server/src/routes.ts` - All route imports
- `server/src/storage.ts` - Database operations
- All files in `server/src/pool-monitor/`
- All files in `server/src/`

### Frontend Import Fixes

**In ALL client files**, update API calls:

**Before:**
```typescript
fetch('/api/pools')
```

**After:**
```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
fetch(`${API_URL}/api/pools`)
```

**Create API client utility:**

```typescript
// client/src/lib/api-client.ts
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const apiClient = {
  get: (path: string) => fetch(`${API_URL}${path}`),
  post: (path: string, data: any) =>
    fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }),
  // ... etc
};
```

---

## 🔧 STEP 3: Update Backend Entry Point

### server/src/index.ts

**Remove Vite middleware in production:**

```typescript
// OLD - Don't load Vite in production
if (process.env.NODE_ENV !== "production") {
  const { setupVite } = await import("./vite.js");
  await setupVite(httpServer, app);
} else {
  // Serve static frontend build
  serveStatic(app);
}

// NEW - Backend is API-only, no frontend serving
// Remove ALL Vite-related code
// Remove serveStatic() call
// Just serve API routes

// For production:
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
```

**Full updated index.ts structure:**

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { registerRoutes } from './routes.js';
// ... other imports

const app = express();

// CORS for frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));

// Security headers
app.use(helmet());

// Body parsing
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', async (req, res) => {
  // ... health check logic
});

// API routes
registerRoutes(app);

// Start server
const PORT = process.env.PORT || 5000;
const httpServer = app.listen(PORT, () => {
  console.log(`[SERVER] API running on port ${PORT}`);
});

// Graceful shutdown
// ... (keep existing graceful shutdown logic)
```

---

## 🔧 STEP 4: Environment Variables

### Backend (.env in server/)

```bash
# Copy to server/.env
DATABASE_URL=postgresql://...
DIRECT_DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
SOLANA_RPC_URL=https://api.devnet.solana.com
DEV_WALLET_PRIVATE_KEY=...
SENTRY_DSN=...
FRONTEND_URL=http://localhost:5173
PORT=5000
NODE_ENV=development
```

### Frontend (.env in client/)

```bash
# Copy to client/.env
VITE_API_URL=http://localhost:5000
VITE_SOLANA_NETWORK=devnet
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
VITE_NODE_ENV=development
```

---

## 🔧 STEP 5: Install Dependencies

```bash
# From project root
cd missout

# Install root dependencies (optional)
npm install

# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install
```

---

## 🚀 STEP 6: Local Development

### Terminal 1: Backend

```bash
cd missout/server
npm run dev
```

Expected output:
```
[ENV] ✅ Development mode - loaded .env file
[SERVER] API running on port 5000
[PostgreSQL] ✅ Connected to database
[REDIS] ✅ Connected to Redis
```

### Terminal 2: Frontend

```bash
cd missout/client
npm run dev
```

Expected output:
```
VITE v7.3.0 ready in 500 ms
➜ Local:   http://localhost:5173/
➜ Network: use --host to expose
```

### Test Full Stack

1. Open http://localhost:5173 in browser
2. Check Network tab - API calls should go to `http://localhost:5000/api/*`
3. Check console for errors

---

## 🚀 STEP 7: Production Deployment

### Backend → Render

**Render Configuration:**

```yaml
# Render.com dashboard settings
Root Directory: server
Build Command: npm install && npm run build
Start Command: npm start

Environment Variables:
DATABASE_URL: postgresql://...
DIRECT_DATABASE_URL: postgresql://...
REDIS_URL: rediss://...
SOLANA_RPC_URL: https://api.devnet.solana.com
DEV_WALLET_PRIVATE_KEY: ***
TREASURY_WALLET_PUBKEY: ***
SWITCHBOARD_PROGRAM_ID: ***
SWITCHBOARD_QUEUE: ***
SENTRY_DSN: ***
FRONTEND_URL: https://your-app.vercel.app
CLIENT_URL: https://your-app.vercel.app
NODE_ENV: production
PORT: (auto-set by Render)
PGSSLMODE: require
NODE_TLS_REJECT_UNAUTHORIZED: 0
```

### Frontend → Vercel

**Vercel Configuration:**

```yaml
# vercel.json (create in client/)
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**Environment Variables in Vercel:**

```
VITE_API_URL=https://your-backend.onrender.com
VITE_SOLANA_NETWORK=mainnet-beta
VITE_SOLANA_RPC_URL=https://your-rpc-url
```

**Deployment Steps:**

1. Push to GitHub
2. Connect repo to Vercel
3. Set Root Directory: `client`
4. Set Build Command: `npm run build`
5. Set Output Directory: `dist`
6. Add environment variables
7. Deploy

---

## 🔍 STEP 8: Verification Checklist

### Backend Checks

- [ ] `cd server && npm run dev` starts without errors
- [ ] Health endpoint returns 200: `curl http://localhost:5000/health`
- [ ] Database connects successfully
- [ ] Redis connects successfully
- [ ] Solana RPC connects
- [ ] API endpoints respond: `curl http://localhost:5000/api/pools`

### Frontend Checks

- [ ] `cd client && npm run dev` starts without errors
- [ ] App loads at http://localhost:5173
- [ ] API calls work (check Network tab)
- [ ] Wallet adapter works
- [ ] All pages render
- [ ] No console errors

### Production Checks

- [ ] Backend deploys to Render successfully
- [ ] Frontend deploys to Vercel successfully
- [ ] CORS configured correctly
- [ ] API calls work from frontend to backend
- [ ] Environment variables set correctly
- [ ] SSL/TLS working
- [ ] Health endpoint accessible

---

## 🐛 Common Issues & Solutions

### Issue 1: CORS Errors

**Error:** `Access-Control-Allow-Origin header missing`

**Solution:**

```typescript
// server/src/index.ts
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### Issue 2: API Calls Failing

**Error:** `Failed to fetch` or `404 Not Found`

**Solution:**

Check `VITE_API_URL` in client/.env:
```bash
# Development
VITE_API_URL=http://localhost:5000

# Production (update after deploying backend)
VITE_API_URL=https://your-backend.onrender.com
```

### Issue 3: Module Not Found

**Error:** `Cannot find module '@shared/routes'`

**Solution:**

Verify tsconfig paths in both server and client:
```json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["../shared/*"]
    }
  }
}
```

### Issue 4: Build Fails on Render

**Error:** `Module not found` during build

**Solution:**

1. Check all imports have `.js` extension
2. Verify package.json has all dependencies
3. Check `tsconfig.json` `outDir` is set to `./dist`

### Issue 5: Environment Variables Not Loading

**Error:** `undefined` when accessing env vars

**Backend:**
```typescript
// Access directly
const dbUrl = process.env.DATABASE_URL;
```

**Frontend:**
```typescript
// Must use VITE_ prefix
const apiUrl = import.meta.env.VITE_API_URL;
```

---

## 📚 File Checklist

### Must Create/Update

- [x] `server/package.json` - Backend dependencies
- [x] `server/tsconfig.json` - Backend TypeScript config
- [x] `server/.env` - Backend environment variables
- [x] `server/src/index.ts` - Remove Vite, add CORS
- [x] `client/package.json` - Frontend dependencies
- [x] `client/tsconfig.json` - Frontend TypeScript config
- [x] `client/.env` - Frontend environment variables
- [x] `client/vite.config.ts` - Vite configuration
- [x] `client/vercel.json` - Vercel deployment config
- [ ] Update all import paths in server files (+.js)
- [ ] Update all API calls in client files (use VITE_API_URL)

---

## 🎯 Summary

**What Changed:**

1. ✅ Split into separate `server/` and `client/` packages
2. ✅ Each has own `package.json`, `tsconfig.json`, `.env`
3. ✅ Backend is API-only (no frontend serving)
4. ✅ Frontend calls backend via `VITE_API_URL`
5. ✅ Independent deployments (Render + Vercel)
6. ✅ CORS configured for cross-origin requests

**What Stayed Same:**

1. ✅ All backend logic (Solana, database, Redis, etc.)
2. ✅ All frontend logic (components, hooks, state)
3. ✅ Shared types in `shared/`
4. ✅ All features preserved

**Next Steps:**

1. Follow migration steps above
2. Test locally (2 terminals)
3. Deploy backend to Render
4. Deploy frontend to Vercel
5. Update `VITE_API_URL` with production backend URL
6. Test production deployment

---

**Migration Time Estimate:** 2-3 hours

**Need Help?** Check the issues section or review logs for specific errors.
