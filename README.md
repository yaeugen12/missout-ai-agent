# 🎰 Missout - Solana Lottery Platform

A decentralized lottery platform built on Solana with fair randomness, instant payouts, and transparent on-chain verification.

## 🏗️ Architecture

This is a **split monorepo** with separate backend and frontend deployments:

```
missout/
├── server/          # Backend API (Node.js + Express) → Deploy to Render
├── client/          # Frontend UI (React + Vite) → Deploy to Vercel
└── shared/          # Shared TypeScript types
```

### Stack

**Backend:**
- Node.js + Express + TypeScript
- PostgreSQL (Neon Database)
- Redis (Upstash)
- Solana Web3.js + Anchor
- Drizzle ORM
- Sentry (monitoring)

**Frontend:**
- React 18 + TypeScript
- Vite
- Solana Wallet Adapter
- TanStack Query
- Tailwind CSS + Shadcn UI
- Zustand (state)

---

## 🚀 Quick Start

### Prerequisites

- Node.js >= 20.0.0
- npm >= 9.0.0
- PostgreSQL database (Neon recommended)
- Redis instance (Upstash recommended)
- Solana wallet with devnet SOL

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/missout.git
cd missout
```

### 2. Install Dependencies

```bash
# Option A: Install all at once
npm run install:all

# Option B: Install separately
cd server && npm install
cd ../client && npm install
```

### 3. Configure Environment Variables

#### Backend (.env in server/)

```bash
cd server
cp .env.example .env
# Edit .env with your credentials
```

Required variables:
- `DATABASE_URL` - Neon PostgreSQL connection string
- `REDIS_URL` - Upstash Redis URL
- `SOLANA_RPC_URL` - Solana RPC endpoint
- `DEV_WALLET_PRIVATE_KEY` - Backend wallet private key
- `FRONTEND_URL` - Frontend URL for CORS

#### Frontend (.env in client/)

```bash
cd client
cp .env.example .env
# Edit .env with your settings
```

Required variables:
- `VITE_API_URL` - Backend API URL (http://localhost:5000 for dev)
- `VITE_SOLANA_RPC_URL` - Solana RPC endpoint

### 4. Database Setup

```bash
cd server

# Run migrations
npm run db:push

# Verify connection
npm run db:test
```

### 5. Run Development Servers

**Terminal 1 - Backend:**
```bash
cd server
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd client
npm run dev
```

**Or run both together:**
```bash
# From project root
npm run dev
```

### 6. Open Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:5000
- Health Check: http://localhost:5000/health

---

## 📦 Project Structure

### Backend (`server/`)

```
server/
├── src/
│   ├── index.ts                  # Main entry point
│   ├── routes.ts                 # API route definitions
│   ├── storage.ts                # Database operations (Drizzle)
│   ├── db.ts                     # PostgreSQL connection pool
│   ├── cache.ts                  # Redis caching
│   ├── cache-middleware.ts       # Cache middleware
│   ├── logger.ts                 # Winston logger
│   ├── sentry-helper.ts          # Sentry error tracking
│   ├── rpc-manager.ts            # Solana RPC failover
│   ├── transactionVerifier.ts    # On-chain tx verification
│   ├── transactionHashTracker.ts # Replay attack prevention
│   ├── transactionCleanup.ts     # Background cleanup job
│   ├── tokenDiscoveryService.ts  # Token metadata discovery
│   ├── pagination.ts             # Pagination utilities
│   ├── pool-monitor/             # Pool state monitoring
│   │   ├── poolMonitor.ts        # Background monitor service
│   │   ├── solanaServices.ts     # Solana program interactions
│   │   └── index.ts
│   └── ml/                       # ML-related modules
├── package.json
├── tsconfig.json
└── .env
```

### Frontend (`client/`)

```
client/
├── src/
│   ├── main.tsx                  # Entry point
│   ├── App.tsx                   # Root component
│   ├── components/               # React components
│   │   ├── ui/                   # Shadcn UI components
│   │   ├── PoolCard.tsx
│   │   ├── RouletteWheel.tsx
│   │   └── ...
│   ├── pages/                    # Route pages
│   │   ├── Home.tsx
│   │   ├── PoolDetails.tsx
│   │   ├── CreatePool.tsx
│   │   └── ...
│   ├── hooks/                    # Custom hooks
│   │   ├── useMissoutSDK.ts
│   │   ├── use-pools.ts
│   │   ├── use-wallet.ts
│   │   └── ...
│   ├── lib/                      # Utilities
│   │   ├── solana-sdk/           # Solana SDK client
│   │   ├── api-client.ts         # API client
│   │   └── utils.ts
│   └── public/                   # Static assets
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .env
```

### Shared (`shared/`)

```
shared/
├── routes.ts     # API route types & Zod schemas
└── schema.ts     # Database schema (Drizzle)
```

---

## 🛠️ Development Scripts

### Backend

```bash
cd server

npm run dev          # Start dev server with hot reload
npm run build        # Build for production
npm run start        # Start production server
npm run check        # TypeScript type checking
npm run db:push      # Push schema changes to database
npm run db:studio    # Open Drizzle Studio
npm run db:migrate   # Run migrations
npm run health       # Check health endpoint
```

### Frontend

```bash
cd client

npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run check        # TypeScript type checking
```

### Root

```bash
# From project root
npm run dev              # Run both backend + frontend
npm run build            # Build both
npm run install:all      # Install all dependencies
npm run clean            # Clean all build artifacts
```

---

## 🚀 Production Deployment

### Backend → Render

1. **Create Web Service on Render**
2. **Configure:**
   - Root Directory: `server`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Environment: Node 20+

3. **Add Environment Variables:**
   ```
   DATABASE_URL=postgresql://...
   DIRECT_DATABASE_URL=postgresql://...
   REDIS_URL=rediss://...
   SOLANA_RPC_URL=https://...
   DEV_WALLET_PRIVATE_KEY=***
   TREASURY_WALLET_PUBKEY=***
   FRONTEND_URL=https://your-frontend.vercel.app
   SENTRY_DSN=https://...
   NODE_ENV=production
   ```

4. **Deploy**

### Frontend → Vercel

1. **Import Git Repository**
2. **Configure:**
   - Root Directory: `client`
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`

3. **Add Environment Variables:**
   ```
   VITE_API_URL=https://your-backend.onrender.com
   VITE_SOLANA_NETWORK=mainnet-beta
   VITE_SOLANA_RPC_URL=https://...
   ```

4. **Deploy**

---

## 🔒 Security

### Implemented Security Features

- ✅ SQL Injection Prevention (parameterized queries)
- ✅ Rate Limiting (100 req/min API, 10 req/5min uploads)
- ✅ CORS Protection (origin validation)
- ✅ Helmet Security Headers
- ✅ Replay Attack Prevention (tx hash tracking)
- ✅ Transaction Verification (on-chain validation)
- ✅ File Upload Security (UUID-based naming, magic byte validation)
- ✅ Graceful Shutdown (30s timeout, connection draining)
- ✅ Error Monitoring (Sentry)

### Security Audits

See [COMPREHENSIVE_PROJECT_AUDIT.md](COMPREHENSIVE_PROJECT_AUDIT.md) and [SECURITY_PATCHES_APPLIED.md](SECURITY_PATCHES_APPLIED.md) for details.

---

## 📚 API Documentation

### Base URL

- Development: `http://localhost:5000`
- Production: `https://your-backend.onrender.com`

### Endpoints

#### Pools
- `GET /api/pools` - List pools (paginated, cached)
- `GET /api/pools/:id` - Get pool details
- `POST /api/pools` - Create pool (requires tx verification)
- `POST /api/pools/:id/join` - Join pool
- `POST /api/pools/:id/donate` - Donate to pool
- `POST /api/pools/:id/cancel` - Cancel pool
- `POST /api/pools/:id/claim-refund` - Claim refund
- `POST /api/pools/:id/claim-rent` - Claim rent

#### Leaderboard
- `GET /api/leaderboard` - Top winners & referrers
- `GET /api/leaderboard/winners` - Paginated winners
- `GET /api/leaderboard/referrers` - Paginated referrers

#### Profiles
- `GET /api/profile/:wallet` - Get profile
- `POST /api/profile/:wallet` - Update profile
- `GET /api/profile/:wallet/transactions` - Transaction history

#### Referrals
- `GET /api/referrals/:wallet` - Referral stats
- `POST /api/referrals/capture` - Capture referral
- `POST /api/referrals/:wallet/claim` - Claim referral rewards

#### System
- `GET /health` - Health check
- `POST /api/upload` - Image upload (rate limited)

---

## 🧪 Testing

### Manual Testing

```bash
# Backend health check
curl http://localhost:5000/health

# Get pools
curl http://localhost:5000/api/pools

# Get leaderboard
curl http://localhost:5000/api/leaderboard
```

### Database Testing

```bash
cd server

# Test connection
npm run db:test

# Open Drizzle Studio
npm run db:studio

# Backup database
npm run db:backup
```

---

## 🐛 Troubleshooting

### Backend won't start

1. Check database connection: `npm run db:test`
2. Verify Redis connection
3. Check environment variables
4. Review logs: `tail -f server/logs/error.log`

### Frontend API calls failing

1. Verify `VITE_API_URL` in `client/.env`
2. Check CORS configuration in backend
3. Check browser console for errors
4. Verify backend is running

### CORS errors

Update `FRONTEND_URL` in backend environment variables to match your frontend domain.

### Database migration issues

```bash
cd server

# Reset database (CAUTION: deletes data)
npm run db:push

# Generate new migration
npm run db:generate
```

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📞 Support

- Issues: [GitHub Issues](https://github.com/yourusername/missout/issues)
- Documentation: [/docs](./docs)
- Security: See [SECURITY.md](SECURITY.md)

---

**Built with ❤️ using Solana, React, and TypeScript**
