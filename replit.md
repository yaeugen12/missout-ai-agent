# MissOut - Solana Lottery Protocol

## Overview

MissOut is a dark neon gaming web application for a Solana-based lottery protocol with a cosmic black hole theme. Users can create and join "Black Holes" (betting pools) where participants stake SPL tokens and a random winner takes all. The app features a distinctive cyberpunk aesthetic with glassmorphism cards, neon glows, and animated vortex effects.

Key terminology:
- Pool = "Black Hole"
- Join = "Get Pulled In"
- Donate = "Feed the Void"
- Winner = "Escapes the Void"

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, Zustand for client state (wallet)
- **Styling**: TailwindCSS with custom CSS variables for theming
- **UI Components**: shadcn/ui component library (Radix UI primitives)
- **Animations**: Framer Motion for complex animations (winner reveal roulette, black hole effects)
- **Build Tool**: Vite with path aliases (@/, @shared/, @assets/)

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Style**: REST endpoints defined in shared/routes.ts with Zod validation
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Session Storage**: connect-pg-simple for PostgreSQL session storage

### Data Storage
- **Primary Database**: PostgreSQL (required via DATABASE_URL environment variable)
- **Schema Location**: shared/schema.ts defines pools, participants, transactions, and profiles tables
- **Migrations**: Drizzle Kit with migrations output to ./migrations directory

### User Profile System
- **Purpose**: Optional off-chain user profiles for cosmetic personalization (nicknames, avatars)
- **Security**: Nonce + wallet signature verification using TweetNaCl
- **Database Table**: profiles table with wallet, nickname, avatar style/seed, nonce, and lastNicknameChange
- **Nickname Rules**: 3-20 characters, alphanumeric + underscore only, 7-day cooldown between changes
- **Avatar System**: Dicebear API with 5 preset styles (bottts, identicon, shapes, thumbs, pixel-art) seeded by wallet address
- **Fallback Behavior**: When no profile exists, displayName falls back to truncated wallet address and avatar uses default Dicebear style
- **Components**: ProfileDisplay (read-only display), ProfileEditModal (edit with validation), integrated into Navbar wallet dropdown

### Blockchain Integration
- **Network**: Solana mainnet
- **RPC Provider**: Helius (configured via VITE_HELIUS_RPC_URL environment variable)
- **Libraries**: @solana/web3.js, @solana/spl-token, @coral-xyz/anchor for blockchain interactions
- **Token Metadata**: Fetches SPL token info including Metaplex metadata for pump.fun tokens
- **Price API**: Jupiter API for USD price lookups with fallback handling
- **Randomness**: Switchboard V4 via @switchboard-xyz/on-demand for verifiable randomness

### Jupiter Swap Integration (client/src/lib/jupiterSwap.ts)
Token purchasing via Jupiter Aggregator API v6:
- **Location**: Integrated in CreatePool step 2 (token verification screen)
- **Features**:
  - SOL → Token swaps with real-time quote preview
  - 500ms debounced quote fetching for smooth UX
  - Configurable slippage: preset buttons (0.5%, 1%, 2%, 5%) + custom input
  - 0.5% platform fee routed to DEV wallet (VITE_DEV_WALLET_PUBKEY env variable)
  - Price impact display with color-coded warnings
- **Functions**:
  - `getJupiterQuote()`: Fetches swap quote with slippage and platform fee
  - `executeJupiterSwap()`: Deserializes and executes versioned transaction
  - `formatTokenAmount()`: Human-readable token amount formatting
- **UI**: Purple/blue gradient card with shopping cart icon, swap button, and "Powered by Jupiter" footer

### Solana SDK (client/src/lib/solana-sdk/)
The frontend SDK provides direct smart contract interactions:
- **Program ID**: 53oTPbfy559uTaJQAbuWeAN1TyWXK1KfxUsM2GPJtrJw
- **client.ts**: MissoutClient class with wallet adapter integration
- **services/pool-service.ts**: Pool operations (createPool, joinPool, donateToPool, cancelPool, claimRefund)
- **pda/derive.ts**: PDA derivation functions for pools and participants
- **utils/token.ts**: TokenAmount utility for safe bigint token conversions
- **idl.ts**: Program IDL definition
- **useMissoutSDK hook**: React hook for SDK integration with wallet connection

### Key Design Patterns
- **Protocol Adapter**: client/src/lib/protocolAdapter.ts provides an abstraction layer for Solana interactions (token info fetching, price lookups)
- **SDK Pattern**: MissoutClient singleton manages Anchor program and connection, updated when wallet connects
- **Shared Types**: Types and schemas in shared/ directory are used by both frontend and backend
- **API Contract**: shared/routes.ts defines the complete API contract with Zod schemas for validation

### Black Hole Animation System (client/src/components/)
Interactive animated experience for pool lifecycle with Framer Motion:
- **BlackHoleExperience**: Main wrapper orchestrating all animation phases based on pool status
- **OrbitingAvatarSystem**: Participant avatars orbit around the black hole with:
  - Motion blur effect that increases with orbit speed
  - Dynamic glow aura that intensifies as pool fills
  - Speed graduation: faster orbits as participants approach singularity
  - Sound integration for orbit and event horizon phases
- **CosmicParticles**: Background layer with 30-40 slow-drifting particles:
  - Low opacity (5-12%) for subtle atmosphere
  - Accelerated mode during countdown/randomness phases
  - Golden color during winner reveal
- **CountdownDisplay**: Timer shown in black hole center when pool is locked:
  - Glowing bar animation (cyan → yellow → cyan)
  - "Event Horizon Reached" pulse on initial lock
  - Cosmic shake effect in final 3 seconds
  - Countdown tick sounds for 3, 2, 1
- **RandomnessLoader**: Pulsating animation during winner selection processing
- **WinnerAttractionAnimation**: Two-phase animation before reveal:
  - Hint phase: Winner avatar glow boost +20%, pulse effect
  - Pull phase: Avatar spirals into singularity (0.5s ease-out) with blur
- **WinnerRevealCard**: Cinematic winner announcement:
  - Backdrop blur effect
  - Cyan → white → cyan flash on reveal
  - Golden particle effects
  - Animated prize amount with glow
- **Phase States**: orbit (open) → countdown (locked) → randomness (processing) → attraction → reveal (winner selected)

### Sound System (client/src/lib/SoundManager.ts)
Howler.js integration with lazy loading for atmospheric audio:
- **sfx_orbit_soft_whoosh.mp3**: Subtle loop during orbit phase
- **sfx_event_horizon_deep_hum.mp3**: Deep hum during countdown
- **sfx_tick.mp3**: Countdown tick for 3, 2, 1
- **sfx_singularity_pulse.mp3**: Pulse during randomness query
- **sfx_reveal_burst.mp3**: Burst on winner reveal
- Volume range: 0.15 - 0.35 for subtle atmosphere
- Lazy loading: Sounds load on first play, not on page load

### Referral Rewards System
Complete referral system allowing users to earn 1.5% of pool fees when their referrals participate:

**Database Tables** (shared/schema.ts):
- `referral_relations`: One-to-one mapping of referred wallet → referrer wallet (immutable)
- `referral_rewards`: Aggregated pending/claimed amounts per referrer per token mint
- `referral_reward_events`: Audit log of individual reward allocations
- `referral_claims`: Claim transaction records with status tracking

**Backend Routes** (server/routes.ts):
- `POST /api/referrals/register`: Register referral relation on wallet connect
- `GET /api/referrals/link/:wallet`: Generate referral link for wallet
- `GET /api/referrals/summary/:wallet`: Get total stats (invited, earned, claimed)
- `GET /api/referrals/rewards/:wallet`: Get pending rewards by token
- `GET /api/referrals/invited/:wallet`: List invited users
- `POST /api/referrals/claim`: Claim rewards with wallet signature verification

**Security Features**:
- Wallet signature verification using TweetNaCl (nacl.sign.detached.verify)
- Timestamp validation with 60-second expiry to prevent replay attacks
- SELECT FOR UPDATE with atomic transaction to prevent race conditions
- Self-referral prevention (cannot refer yourself)

**Frontend Integration**:
- `useReferralCapture` hook: Captures ?ref= URL parameter to localStorage, auto-registers on wallet connect
- Referrals page: Shows stats, pending rewards with claim buttons, invited users list
- Claim flow: Signs timestamped message with wallet before claiming

**Reward Flow**:
1. User visits site with ?ref=WALLET_ADDRESS URL
2. Referrer stored in localStorage, URL cleaned
3. On wallet connect, referral registered via POST /api/referrals/register
4. When pool completes, allocateReferralRewards() splits 1.5% treasury fee equally among unique referrers
5. User claims via signed message → atomic database transaction → pending status for payout processing

### Leaderboard System (client/src/pages/Leaderboard.tsx)
Comprehensive ranking display for winners and referrers with cosmic styling:

**Features**:
- **Winners Tab** (gold theme): Rankings by total wins and tokens won
- **Referrers Tab** (purple theme): Rankings by referral count and earnings
- **Cosmic Styling**: Gold/silver/bronze gradients for top 3, crown/star/sparkles icons
- **Dicebear Avatars**: Auto-generated avatars based on wallet address

**Backend Endpoints** (server/routes.ts):
- `GET /api/leaderboard/winners?limit=20`: Top winners with winsCount, totalTokensWon, tokenSymbol, lastWinAt
- `GET /api/leaderboard/referrers?limit=20`: Top referrers with referralsCount, totalTokensEarned, dates

**Storage Functions** (server/storage.ts):
- `getTopWinners(limit)`: SQL aggregation of pools where winnerWallet = wallet, status = ended
- `getTopReferrers(limit)`: SQL aggregation of referral_relations with reward amounts

**Display Metrics**:
- Winners: Rank, avatar, wallet, wins count, total tokens won, token symbol, last win timestamp
- Referrers: Rank, avatar, wallet, referral count, total earned, first/last referral dates

### Claims Center (client/src/pages/Claims.tsx)
Unified interface for recovering funds from cancelled pools and reclaiming rent from closed pools:

**Features**:
- **Refunds Tab** (cyan theme): Recover tokens from cancelled Black Holes where user was a participant
- **Rent Tab** (amber theme): Reclaim rent from ended/cancelled pools where user was the creator
- **Batch Claiming**: "Claim All" buttons appear when 2+ claims are available

**Backend Route** (server/routes.ts):
- `GET /api/pools/claimable?wallet=ADDRESS`: Returns eligible pools for both refunds and rent recovery

**SDK Functions** (client/src/hooks/useMissoutSDK.ts):
- `claimRefund(poolId, walletAddress)`: Claim refund from cancelled pool
- `claimRent(poolId, closeTarget)`: Claim rent from closed pool
- `claimRefundsBatch(poolIds, onProgress)`: Batch claim multiple refunds with chunked transactions
- `claimRentsBatch(poolIds, closeTarget, onProgress)`: Batch claim multiple rents with chunked transactions

**Batch Claiming Strategy**:
- Chunks instructions into groups of 3 to stay within Solana's 1232-byte transaction limit
- Real-time progress tracking with `BatchClaimProgress` type (current/total, status per pool)
- Partial failure handling: returns per-pool success/failure with error messages

**Eligibility Rules**:
- Refund: pool.status === "cancelled" AND user is participant
- Rent: pool.status in ["ended", "cancelled"] AND user is pool creator

## Security Architecture (Production-Ready)

### Claim Endpoint Security (server/routes.ts)
Multi-layer verification for all claim operations:
1. **Wallet Signature Verification**: Uses TweetNaCl (nacl.sign.detached.verify) to cryptographically prove wallet ownership
2. **Anti-Replay Messages**: Messages must match pattern `claim-{type}:{poolId}:{timestamp}` to prevent replay attacks
3. **On-Chain Transaction Verification**: verifyOnChainTransaction() confirms:
   - Transaction exists on Solana blockchain
   - Transaction did not fail (no tx.meta.err)
   - Expected wallet is in transaction signers
   - Pool address is in transaction accounts (when applicable)
4. **Creator/Participant Checks**: Verifies caller is authorized (participant for refunds, creator for rent)

### File Upload Hardening (server/routes.ts)
- **Magic Byte Validation**: Validates actual file content headers for PNG/JPEG/GIF/WebP
- **Secure Filenames**: Uses crypto.randomBytes(16) for random hex filenames
- **Size Limits**: 5MB max with multer, 10 files max
- **Extension Verification**: Whitelist of allowed extensions (png, jpg, jpeg, gif, webp)

### Duplicate Participant Prevention (server/storage.ts)
- addParticipant() throws structured error `{ code: "DUPLICATE_PARTICIPANT" }` if wallet already exists in pool
- Prevents economic exploits from multiple entries

### Wallet Authentication (shared/routes.ts, server/routes.ts)
- Nonce-based challenge-response for profile updates
- Message signing with timestamp validation
- 60-second message expiry to prevent replay attacks

### Recommendations for Mainnet
- Consider external security audit before mainnet deployment
- Monitor for rate limiting abuse
- Add WebP magic byte validation (currently accepts all WebP headers)
- Review bigint vs doublePrecision for numeric precision in large token amounts

## External Dependencies

### Database
- PostgreSQL database (required)
- Connection via DATABASE_URL environment variable
- Schema managed by Drizzle ORM

### Blockchain Services
- **Helius RPC**: Primary Solana RPC endpoint for token data and blockchain queries
  - Environment variable: VITE_HELIUS_RPC_URL
- **Jupiter Price API**: Token USD price lookups for minimum entry validation

### Third-Party UI Libraries
- Radix UI primitives (dialogs, menus, forms, etc.)
- Framer Motion for animations
- react-day-picker for calendar components
- embla-carousel-react for carousels
- vaul for drawer components
- recharts for charts

### Build & Development
- Vite development server with HMR
- esbuild for production server bundling
- Replit-specific plugins for development (cartographer, dev-banner, runtime-error-modal)