# Production Pool Monitor Implementation

## Overview

The pool monitor is now a **production-ready, deterministic state machine** that manages the full lifecycle of pools from creation to payout, using **on-chain state as the single source of truth**.

---

## Architecture

### Components

1. **solanaServices.ts** - Blockchain interaction layer
   - Loads DEV wallet from environment variables
   - Initializes Anchor program with backend wallet
   - Implements all blockchain operations with Anchor readiness checks
   - Direct instruction calls to smart contract

2. **poolMonitor.ts** - State machine and orchestration
   - Polls active pools every 5 seconds
   - Fetches on-chain state for each pool
   - Syncs database state with blockchain state
   - Executes correct action based on on-chain pool status

3. **index.ts** - Server initialization
   - Initializes Solana services on startup
   - Starts pool monitor
   - Logs DEV wallet public key (never private key)

---

## State Machine Flow

```
OPEN
  ↓ (pool fills up - automatic by smart contract)
LOCKED
  ↓ (backend: wait for lock duration, then call unlockPool())
UNLOCKED
  ↓ (backend: call requestRandomness())
RANDOMNESS_REQUESTED
  ↓ (Switchboard: fulfills randomness automatically)
RANDOMNESS_FULFILLED
  ↓ (backend: call selectWinner())
WINNER_SELECTED
  ↓ (backend: call payoutWinner())
ENDED
```

### State Handlers

| State | Backend Action | Smart Contract State Transition |
|-------|----------------|----------------------------------|
| **OPEN** | Monitor only | → LOCKED (when full) |
| **LOCKED** | Wait for lock duration → `unlockPool()` | → UNLOCKED |
| **UNLOCKED** | `requestRandomness()` | → RANDOMNESS_REQUESTED |
| **RANDOMNESS_REQUESTED** | Wait for Switchboard | → RANDOMNESS_FULFILLED |
| **RANDOMNESS_FULFILLED** | `selectWinner()` | → WINNER_SELECTED |
| **WINNER_SELECTED** | `payoutWinner()` | → ENDED |
| **ENDED** | Monitor only | Terminal state |

---

## Key Features

### ✅ Deterministic State Machine
- **On-chain state is the ONLY source of truth**
- Database state is synced FROM blockchain, not TO blockchain
- Each state has exactly one action
- No ambiguity, no race conditions

### ✅ Anchor Readiness Checks
- Every blockchain operation preceded by `waitForAnchorPool()`
- Prevents AccountNotInitialized (3012) errors
- 10-second timeout with 1-second retry intervals
- Same pattern used in frontend SDK

### ✅ Restart-Safe & Idempotent
- Monitor can be stopped/started at any time
- Operations are idempotent (safe to retry)
- State detection from on-chain data
- No local state that can become stale

### ✅ Environment Configuration
- `DEV_WALLET_PRIVATE_KEY` - Supports JSON array `[1,2,3,...]` or base58
- `SOLANA_RPC_URL` - Defaults to devnet
- Private key NEVER logged (only public key)

### ✅ Comprehensive Logging
- Format: `[MONITOR] pool=<id> state=<state> action=<action>`
- Success: `✅ SUCCESS tx=<signature>`
- Failure: `❌ FAILED: <error>`
- Anchor warm-up attempts logged
- Clear audit trail for debugging

---

## Implementation Details

### solanaServices.ts

**Initialization (`initializeSolanaServices`):**
```typescript
- Load DEV wallet from ENV (JSON array or base58)
- Create Connection to Solana RPC
- Initialize Anchor Program with Wallet
- Log DEV wallet public key
```

**Blockchain Operations:**
- `fetchPoolStateOnChain()` - Get pool state using Anchor
- `unlockPoolOnChain()` - Call unlock_pool instruction
- `requestRandomnessOnChain()` - Call request_randomness instruction
- `selectWinnerOnChain()` - Call select_winner instruction
- `payoutWinnerOnChain()` - Call payout_winner instruction

**All operations:**
1. Check Anchor readiness with `waitForAnchorPool()`
2. Execute instruction via `program.methods.<instruction>().rpc()`
3. Confirm transaction
4. Log success/failure

### poolMonitor.ts

**Polling Loop:**
```typescript
Every 5 seconds:
  1. Get all active pools from database
  2. For each pool:
     a. Fetch on-chain state
     b. Sync DB state if mismatch
     c. Execute handler based on on-chain status
```

**State Detection:**
```typescript
ON-CHAIN STATE → HANDLER
status.open → handleOpen()
status.locked → handleLocked()
status.unlocked → handleUnlocked()
status.randomnessRequested → handleRandomnessRequested()
status.randomnessFulfilled → handleRandomnessFulfilled()
status.winnerSelected → handleWinnerSelected()
status.ended → (no action)
```

**Error Handling:**
- Max 3 retries per action
- Retry count resets after success
- Failed operations logged but don't crash monitor
- Next tick will retry failed operations

---

## Environment Variables

### Required

**DEV_WALLET_PRIVATE_KEY** - Backend wallet for signing transactions

Supported formats:
```bash
# JSON array (from Solana CLI keypair.json)
DEV_WALLET_PRIVATE_KEY="[1,2,3,4,...,64]"

# Base58 (from Phantom export)
DEV_WALLET_PRIVATE_KEY="5Jv8...base58..."
```

### Optional

**SOLANA_RPC_URL** - RPC endpoint (defaults to devnet)
```bash
SOLANA_RPC_URL="https://api.devnet.solana.com"
```

---

## Startup Sequence

```
1. Server starts (index.ts)
2. initializeSolanaServices() called
   → Loads DEV wallet from ENV
   → Initializes Anchor program
   → Logs: "✅ DEV wallet loaded: <pubkey>"
   → Logs: "✅ Anchor program initialized"
3. poolMonitor.start() called
   → Logs: "Pool monitor started"
4. Every 5 seconds: Monitor polls and processes pools
```

---

## Expected Console Output

### On Startup
```
[MONITOR] Initializing Solana services...
[MONITOR] ✅ DEV wallet loaded: 8xYz...AbCd
[MONITOR] ✅ Anchor program initialized
[PoolMonitor] Starting pool monitor...
[PoolMonitor] Pool monitor started
```

### During Pool Lifecycle
```
──────────────────────────────────────────────────
[PoolMonitor] Processing pool: 123
[MONITOR] pool=5GtH8... Fetching on-chain state...
[MONITOR] pool=5GtH8... ✅ Anchor ready after 1 attempts
[MONITOR] pool=5GtH8... state={"locked":{}}
[PoolMonitor] Pool 123 on-chain state: {"locked":{}}
[PoolMonitor] Pool 123 state=LOCKED now=1704500000 unlockAt=1704500060 remaining=60s
[PoolMonitor] Pool 123 still locked, waiting 60s

──────────────────────────────────────────────────
[PoolMonitor] Processing pool: 123
[MONITOR] pool=5GtH8... Fetching on-chain state...
[MONITOR] pool=5GtH8... ✅ Anchor ready after 1 attempts
[MONITOR] pool=5GtH8... state={"locked":{}}
[PoolMonitor] Pool 123 state=LOCKED now=1704500060 unlockAt=1704500060 remaining=0s
[PoolMonitor] Pool 123 lock period ended, calling unlockPool()...
[MONITOR] pool=5GtH8... action=UNLOCK Starting...
[MONITOR] pool=5GtH8... ✅ Anchor ready after 1 attempts
[MONITOR] pool=5GtH8... action=UNLOCK ✅ SUCCESS tx=3kL9P...
[PoolMonitor] Pool 123 ✅ unlockPool() succeeded

──────────────────────────────────────────────────
[PoolMonitor] Processing pool: 123
[MONITOR] pool=5GtH8... Fetching on-chain state...
[MONITOR] pool=5GtH8... ✅ Anchor ready after 1 attempts
[MONITOR] pool=5GtH8... state={"unlocked":{}}
[PoolMonitor] Pool 123 state=UNLOCKED, calling requestRandomness()...
[MONITOR] pool=5GtH8... action=REQUEST_RANDOMNESS Starting...
[MONITOR] pool=5GtH8... ✅ Anchor ready after 1 attempts
[MONITOR] pool=5GtH8... action=REQUEST_RANDOMNESS ✅ SUCCESS tx=8mN2Q...
[PoolMonitor] Pool 123 ✅ requestRandomness() succeeded

──────────────────────────────────────────────────
[PoolMonitor] Processing pool: 123
[MONITOR] pool=5GtH8... state={"randomnessRequested":{}}
[PoolMonitor] Pool 123 state=RANDOMNESS_REQUESTED, waiting for Switchboard fulfillment...

(... Switchboard fulfills randomness automatically ...)

──────────────────────────────────────────────────
[PoolMonitor] Processing pool: 123
[MONITOR] pool=5GtH8... state={"randomnessFulfilled":{}}
[PoolMonitor] Pool 123 state=RANDOMNESS_FULFILLED, calling selectWinner()...
[MONITOR] pool=5GtH8... action=SELECT_WINNER Starting...
[MONITOR] pool=5GtH8... ✅ Anchor ready after 1 attempts
[MONITOR] pool=5GtH8... action=SELECT_WINNER ✅ SUCCESS tx=2pL7K...
[PoolMonitor] Pool 123 ✅ selectWinner() succeeded

──────────────────────────────────────────────────
[PoolMonitor] Processing pool: 123
[MONITOR] pool=5GtH8... state={"winnerSelected":{}}
[PoolMonitor] Pool 123 state=WINNER_SELECTED, calling payoutWinner()...
[MONITOR] pool=5GtH8... action=PAYOUT Starting...
[MONITOR] pool=5GtH8... ✅ Anchor ready after 1 attempts
[MONITOR] pool=5GtH8... action=PAYOUT ✅ SUCCESS tx=9qR3M...
[PoolMonitor] Pool 123 ✅ payoutWinner() succeeded, winner=7xYz...
```

---

## Error Handling Examples

### Anchor Warm-up Timeout
```
[MONITOR] pool=5GtH8... Anchor warm-up attempt 1/10: Account does not exist
[MONITOR] pool=5GtH8... Anchor warm-up attempt 2/10: Account does not exist
[MONITOR] pool=5GtH8... ✅ Anchor ready after 3 attempts
```

### Transaction Failure
```
[MONITOR] pool=5GtH8... action=UNLOCK Starting...
[MONITOR] pool=5GtH8... action=UNLOCK ❌ FAILED: Lock period not expired
[PoolMonitor] Pool 123 ❌ unlockPool() failed: Lock period not expired
[PoolMonitor] Pool 123 action unlock failed 1 times, will retry next tick
```

---

## Testing Checklist

### 1. Initialization
- [ ] DEV wallet loads from ENV (JSON array format)
- [ ] DEV wallet loads from ENV (base58 format)
- [ ] Public key logged (not private key)
- [ ] Anchor program initializes successfully
- [ ] Pool monitor starts without errors

### 2. State Machine
- [ ] LOCKED → unlockPool() when lock duration expires
- [ ] UNLOCKED → requestRandomness() immediately
- [ ] RANDOMNESS_REQUESTED → waits for Switchboard
- [ ] RANDOMNESS_FULFILLED → selectWinner() immediately
- [ ] WINNER_SELECTED → payoutWinner() immediately

### 3. Anchor Readiness
- [ ] All operations preceded by waitForAnchorPool()
- [ ] Warm-up succeeds after 1-3 attempts
- [ ] No AccountNotInitialized (3012) errors

### 4. Restart Safety
- [ ] Monitor can be stopped and restarted
- [ ] Resumes from correct state
- [ ] No duplicate transactions
- [ ] Idempotent operations

### 5. Error Handling
- [ ] Failed operations retry on next tick
- [ ] Retry count resets after success
- [ ] Monitor doesn't crash on errors
- [ ] Clear error messages in logs

---

## Production Deployment

### 1. Configure Environment
```bash
# .env file
DEV_WALLET_PRIVATE_KEY="[1,2,3,...]"  # Backend wallet
SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
```

### 2. Fund DEV Wallet
```bash
# Ensure wallet has enough SOL for transaction fees
# Recommended: 0.5 SOL for transaction fees
```

### 3. Start Server
```bash
cd project1
npm run dev   # Development
npm start     # Production
```

### 4. Monitor Logs
```bash
# Watch for:
# - DEV wallet initialization
# - Pool processing logs
# - Transaction success/failure
# - Any error messages
```

### 5. Health Checks
```bash
# Check monitor status
curl http://localhost:5000/api/monitor/status

# Expected response:
{
  "running": true,
  "processingCount": 0,
  "processingPools": [],
  "retries": {}
}
```

---

## Security Considerations

### ✅ Private Key Safety
- DEV wallet private key stored ONLY in `.env`
- Never logged to console
- Only public key logged for verification

### ✅ Transaction Signing
- All transactions signed by DEV wallet
- Backend has full control over pool lifecycle
- No user signatures required for automated actions

### ✅ State Validation
- On-chain state is source of truth
- Database state synced FROM blockchain
- No reliance on potentially stale database state

---

## Differences from Stub Implementation

### Before (Stub)
- Simulated delays with `setTimeout()`
- Fake randomness with `crypto.randomBytes()`
- Winner selection in backend (incorrect)
- Database state as source of truth
- No Anchor readiness checks

### After (Production)
- Real blockchain transactions
- Switchboard VRF for randomness
- Winner selection on-chain (correct)
- On-chain state as source of truth
- Anchor readiness checks on all operations

---

## Files Modified

1. **project1/server/pool-monitor/solanaServices.ts** (complete rewrite)
   - Removed all stub functions
   - Added real Anchor program integration
   - Implemented DEV wallet loading from ENV
   - Added Anchor readiness checks

2. **project1/server/pool-monitor/poolMonitor.ts** (complete rewrite)
   - Changed from database state to on-chain state detection
   - Implemented deterministic state machine
   - Added state synchronization logic
   - Improved error handling and logging

3. **project1/server/index.ts** (modified)
   - Added `initializeSolanaServices()` call on startup
   - Added `poolMonitor.start()` call
   - Added error handling for initialization failures

---

## Summary

The production pool monitor is now:

✅ **Deterministic** - On-chain state drives all decisions
✅ **Reliable** - Anchor readiness checks prevent errors
✅ **Restart-safe** - Can stop/start without losing state
✅ **Idempotent** - Operations safe to retry
✅ **Observable** - Comprehensive logging for debugging
✅ **Secure** - Private keys never logged
✅ **Production-ready** - Full lifecycle automation

**No manual intervention required** - pools automatically progress from creation to payout based on on-chain state.
