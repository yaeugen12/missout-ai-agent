# Missout - Solana Lottery Platform

## Overview

Missout is a decentralized lottery platform built on Solana blockchain. Users can create and join token pools where participants stake tokens, and a random winner is selected through on-chain randomness (Switchboard VRF). The platform features real-time updates via WebSocket, wallet integration, and a visual "black hole" themed UI for the lottery experience.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### January 24, 2026 - Mainnet Migration & Referral Payouts
- **Network switched to mainnet-beta**: All Solana configuration now defaults to mainnet
- **RPC endpoints**: Using Helius mainnet RPC (https://mainnet.helius-rpc.com)
- **Switchboard mainnet**: Using mainnet Switchboard program and queue
- **Environment variables**: Updated all env vars to point to mainnet configuration
- **Default network**: Application now defaults to mainnet-beta instead of devnet
- **Treasury wallet for payouts**: 4ZscUyoKFWfU7wjeZKpiuw7Nr8Q8ZdAQmr4YzHNQ74B3
- **Referral payout system**: Added automatic SOL transfers from treasury wallet when users claim referral rewards

### January 24, 2026 - Transaction Stabilization Fix
- **Fixed "multiple signature required" issue**: Added stabilization delays between rapid successive blockchain transactions
- **Batch claim improvements**: Added 2-second delay between transaction chunks in batch refund/rent claims
- **Post-transaction cooldown**: Added 500ms stabilization delay after each confirmed transaction
- **LSP fix**: Fixed missing `tokenProgramId` variable in `sweepExpiredPool` function
- **Claims Center**: Improved case-insensitive wallet matching for claim visibility

## System Architecture

### Monorepo Structure
The project uses a split monorepo pattern with three main directories:
- `server/` - Express backend API with TypeScript
- `client/` - React frontend with Vite
- `shared/` - Common TypeScript types and schemas used by both

### Backend Architecture

**Framework**: Express.js with TypeScript, running via `tsx` for development and production (no build step required).

**Database**: PostgreSQL with Drizzle ORM
- Schema defined in `shared/schema.ts`
- Supports pgBouncer connection pooling for production
- Uses two connection strings: `DATABASE_URL` (pooled) and `DIRECT_DATABASE_URL` (for migrations)

**Caching**: Redis (Upstash) for API response caching
- Optional dependency - app works without it
- Cache middleware in `server/src/cache-middleware.ts`

**Real-time**: Socket.IO for WebSocket connections
- Pool chat functionality
- Live notifications for pool events

**Blockchain Integration**:
- Solana Web3.js and Anchor for on-chain interactions
- Switchboard On-Demand for verifiable randomness
- Custom RPC manager with failover support (`server/src/rpc-manager.ts`)
- Transaction verification to prevent replay attacks

**Key Services**:
- Pool monitoring service for tracking on-chain pool state
- Price tracking service for token USD values
- Token discovery service for finding new tokens
- Notification service for user alerts

### Frontend Architecture

**Framework**: React 18 with TypeScript and Vite

**State Management**:
- TanStack Query for server state and caching
- Zustand for local client state
- Custom hooks pattern for feature logic

**Wallet Integration**:
- Solana Wallet Adapter supporting Phantom, Backpack, Solflare
- Custom `useMissoutSDK` hook for blockchain operations

**UI Components**:
- Shadcn UI component library (Radix primitives + Tailwind)
- Framer Motion for animations
- Custom "black hole" visualization for lottery experience

**Styling**:
- Tailwind CSS with CSS variables for theming
- Cyberpunk/tech aesthetic with custom fonts (Orbitron, Rajdhani, Space Grotesk)

### API Design

RESTful endpoints defined in `shared/routes.ts` using Zod schemas for validation. Key endpoints:
- `/api/pools` - Pool CRUD operations
- `/api/pools/:id/join` - Join a pool
- `/api/profile` - User profile management
- `/api/leaderboard` - Rankings and statistics

### Security Features
- Rate limiting on sensitive endpoints
- Transaction hash tracking to prevent replay attacks
- Wallet signature verification for authenticated actions
- Helmet.js for HTTP security headers

## External Dependencies

### Blockchain Services
- **Solana RPC**: Configurable endpoints with failover (Helius recommended)
- **Switchboard On-Demand**: Verifiable randomness for winner selection
- **SPL Token Program**: Token operations (supports both SPL Token and Token-2022)

### Infrastructure
- **PostgreSQL**: Primary database (Supabase, Neon, or self-hosted)
- **Redis**: Caching layer (Upstash or self-hosted)
- **Google Cloud Storage**: Avatar/image uploads

### Monitoring
- **Sentry**: Error tracking for both frontend and backend
- **Winston**: Structured logging on backend

### Third-Party APIs
- Token metadata services for coin information
- Price APIs for USD conversion

### Deployment Targets
- Backend: Render (or similar Node.js hosts)
- Frontend: Vercel (configured in `client/vercel.json`)