# Security Audit Results - 2026-01-08

## Audit Scope

Verificare a două aspecte critice de securitate:
1. **Signer Verification** - Verifică dacă wallet-ul din request matches signer-ul tranzacției
2. **Replay Attack Prevention** - Verifică protecție împotriva refolosirii aceluiași txHash

---

## 1. Signer Verification ✅ IMPLEMENTED

### Status: 🟢 SECURE

Toate endpoint-urile care verifică tranzacții folosesc funcția `verifyUserTransaction()` care include verificare explicită de signer.

### Implementation

**File:** [server/transactionVerifier.ts](missout/server/transactionVerifier.ts:322-334)

```typescript
// Step 3: Verify signer (first account must be the user wallet)
const accountKeys = tx.transaction.message.getAccountKeys();
const signerPubkey = accountKeys.get(0);

if (!signerPubkey || signerPubkey.toBase58() !== expectedWallet) {
  logger.warn(
    `${logPrefix} Signer mismatch: expected=${expectedWallet.slice(0, 16)}... got=${signerPubkey?.toBase58().slice(0, 16) || "NONE"}`
  );
  return {
    valid: false,
    reason: "Transaction signer does not match your wallet.",
  };
}
```

### Protection Against

| Attack | Method | Status |
|--------|--------|--------|
| Wallet spoofing | Submit valid txHash from another wallet | ✅ BLOCKED |
| Transaction stealing | Use someone else's transaction | ✅ BLOCKED |
| Impersonation | Claim as different user | ✅ BLOCKED |

### Test Case

```bash
# Attack: Submit valid txHash but with wrong wallet address
curl -X POST http://localhost:5000/api/pools/74/claim-refund \
  -H "Content-Type: application/json" \
  -d '{
    "wallet": "ATTACKER_WALLET_ADDRESS",
    "txHash": "VALID_TX_FROM_VICTIM",
    "signature": "ATTACKER_SIGNATURE",
    "message": "claim-refund:74:1234567890"
  }'

# Expected Response:
# 400 Bad Request
# {
#   "message": "Transaction signer does not match your wallet."
# }
```

### Endpoints Protected

1. ✅ `POST /api/pools/:poolId/claim-refund` - Uses `verifyClaimRefundTransaction()`
2. ✅ `POST /api/pools/:poolId/claim-rent` - Uses `verifyClaimRentTransaction()`
3. ✅ `POST /api/pools/:poolId/cancel` - Uses `verifyCancelPoolTransaction()`
4. ✅ `POST /api/pools/:poolId/donate` - Uses `verifyDonateTransaction()`
5. ✅ `POST /api/pools/:poolId/join` - Uses `verifyJoinTransaction()` (basic check)
6. ✅ `POST /api/pools` - Uses `verifyPoolCreationTransaction()` (no signer check needed)

---

## 2. Replay Attack Prevention ⚠️ PARTIAL

### Status: 🟡 NEEDS IMPROVEMENT

**Current Protection:**
- ✅ Transaction age check (5 minutes max)
- ✅ Duplicate claim check (database flag: `refundClaimed`, `rentClaimed`)
- ❌ No database tracking of used transaction hashes

**Vulnerability:**
Within the 5-minute window, an attacker could potentially reuse the same txHash if the database flag check has a race condition.

### Current Implementation

#### Claim Refund Endpoint

**File:** [server/routes.ts](missout/server/routes.ts:293-303)

```typescript
// Verify participant exists and hasn't already claimed
const participantsList = await storage.getParticipants(poolId);
const participant = participantsList.find(p => p.walletAddress === wallet);

if (!participant) {
  return res.status(404).json({ message: "Participant not found in this pool" });
}

if (participant.refundClaimed) {
  return res.status(409).json({ message: "Refund already claimed" });
}

const result = await storage.markRefundClaimed(poolId, wallet);
```

**Issue:** Race condition between check (`if (participant.refundClaimed)`) and update (`markRefundClaimed()`).

#### Claim Rent Endpoint

**File:** [server/routes.ts](missout/server/routes.ts:370-372)

```typescript
if (pool.rentClaimed) {
  return res.status(409).json({ message: "Rent already claimed" });
}

const result = await storage.markRentClaimed(poolId);
```

**Same Issue:** Race condition between check and update.

### Attack Scenario

```
Time T0: User submits claim-refund with txHash="ABC123"
  - Backend checks: participant.refundClaimed = false ✅
  - Backend starts processing...

Time T0+100ms: Attacker submits SAME txHash="ABC123"
  - Backend checks: participant.refundClaimed = false ✅ (not updated yet)
  - Backend starts processing...

Time T0+200ms: First request updates DB: refundClaimed = 1
Time T0+300ms: Second request updates DB: refundClaimed = 1 (duplicate claim!)
```

### Protection Layers

| Layer | Status | Effectiveness |
|-------|--------|---------------|
| Transaction age check (5 min) | ✅ ACTIVE | Limits replay window |
| Database flag check | ✅ ACTIVE | Prevents duplicate claims (with race condition) |
| Message timestamp validation | ✅ ACTIVE | Each message unique per pool+timestamp |
| Wallet signature verification | ✅ ACTIVE | Proves ownership |
| **Transaction hash uniqueness constraint** | ❌ MISSING | Would prevent ALL replays |

---

## Recommendations

### 🔴 HIGH PRIORITY: Add Transaction Hash Tracking

Create a new table to track used transaction hashes:

#### Database Schema

```sql
CREATE TABLE used_transactions (
  tx_hash VARCHAR(88) PRIMARY KEY,
  pool_id INTEGER NOT NULL,
  wallet_address VARCHAR(44) NOT NULL,
  operation_type VARCHAR(20) NOT NULL, -- 'claim_refund', 'claim_rent', 'donate', etc.
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tx_hash)
);

-- Index for cleanup queries
CREATE INDEX idx_used_transactions_timestamp ON used_transactions(used_at);
```

#### Updated Endpoint Logic

```typescript
app.post("/api/pools/:poolId/claim-refund", async (req, res) => {
  try {
    const { txHash, wallet } = req.body;

    // 1. Check if transaction hash already used (BEFORE any other checks)
    const txUsed = await db.query(
      "SELECT * FROM used_transactions WHERE tx_hash = $1",
      [txHash]
    );

    if (txUsed.rows.length > 0) {
      console.log("[SECURITY] Transaction replay attempt:", {
        txHash: txHash.slice(0, 20),
        previouslyUsedAt: txUsed.rows[0].used_at
      });
      return res.status(409).json({
        message: "Transaction hash already used. Possible replay attack."
      });
    }

    // 2. Verify transaction on-chain (as before)
    const verification = await verifyClaimRefundTransaction(...);
    if (!verification.valid) {
      return res.status(400).json({ message: verification.reason });
    }

    // 3. Check if already claimed (as before)
    if (participant.refundClaimed) {
      return res.status(409).json({ message: "Refund already claimed" });
    }

    // 4. ATOMIC TRANSACTION: Record tx_hash + mark claimed
    await db.query("BEGIN");

    try {
      // Insert into used_transactions (will fail if duplicate due to UNIQUE constraint)
      await db.query(
        `INSERT INTO used_transactions (tx_hash, pool_id, wallet_address, operation_type)
         VALUES ($1, $2, $3, $4)`,
        [txHash, poolId, wallet, 'claim_refund']
      );

      // Mark refund as claimed
      await storage.markRefundClaimed(poolId, wallet);

      await db.query("COMMIT");

      res.json({ success: true });
    } catch (err) {
      await db.query("ROLLBACK");

      if (err.code === '23505') { // PostgreSQL unique violation
        console.log("[SECURITY] Race condition prevented by unique constraint:", { txHash });
        return res.status(409).json({ message: "Transaction already processed" });
      }

      throw err;
    }

  } catch (error) {
    console.error("Error processing claim:", error);
    res.status(500).json({ message: "Failed to process claim" });
  }
});
```

#### Cleanup Job

```typescript
// Run daily to remove old transaction records (keep 30 days)
setInterval(async () => {
  await db.query(
    "DELETE FROM used_transactions WHERE used_at < NOW() - INTERVAL '30 days'"
  );
  console.log("[CLEANUP] Removed old transaction records");
}, 24 * 60 * 60 * 1000); // Every 24 hours
```

### 🟡 MEDIUM PRIORITY: Database Transaction Refactoring

Even with the `used_transactions` table, the current code has a check-then-update pattern that's vulnerable to race conditions. Refactor to use database transactions:

```typescript
// BEFORE (vulnerable)
if (participant.refundClaimed) {
  return res.status(409).json({ message: "Already claimed" });
}
await storage.markRefundClaimed(poolId, wallet);

// AFTER (safe)
const result = await db.query(`
  UPDATE participants
  SET refund_claimed = 1
  WHERE pool_id = $1 AND wallet_address = $2 AND refund_claimed = 0
  RETURNING *
`, [poolId, wallet]);

if (result.rowCount === 0) {
  return res.status(409).json({ message: "Already claimed or participant not found" });
}
```

This uses PostgreSQL's `UPDATE ... WHERE condition` atomically - if `refund_claimed` is already 1, the WHERE clause fails and `rowCount` is 0.

---

## Summary

### Current Security Status

| Security Aspect | Status | Risk Level | Notes |
|-----------------|--------|------------|-------|
| Signer verification | ✅ SECURE | 🟢 LOW | Properly implemented in all endpoints |
| Transaction age check | ✅ SECURE | 🟢 LOW | 5-minute window prevents old replays |
| Duplicate claim check | ⚠️ PARTIAL | 🟡 MEDIUM | Race condition possible within 5-min window |
| Message replay prevention | ✅ SECURE | 🟢 LOW | Timestamp in message prevents cross-claim replay |
| Wallet signature validation | ✅ SECURE | 🟢 LOW | Cryptographic proof of ownership |
| Transaction hash tracking | ❌ MISSING | 🟡 MEDIUM | Could allow replay within 5-min window |

### Action Items

1. **🔴 IMMEDIATE:** Add `used_transactions` table with UNIQUE constraint
2. **🔴 IMMEDIATE:** Wrap claim operations in database transactions
3. **🟡 RECOMMENDED:** Add automated tests for replay attack scenarios
4. **🟡 RECOMMENDED:** Add monitoring/alerting for duplicate transaction attempts
5. **🟢 NICE-TO-HAVE:** Add daily cleanup job for old transaction records

### Risk Assessment

**Without fixes:**
- Small window (5 minutes) for replay attacks
- Requires attacker to spam requests within RPC propagation time
- Database flag check provides partial protection (but not atomic)
- **Overall Risk:** 🟡 MEDIUM

**With fixes applied:**
- UNIQUE constraint on tx_hash prevents ALL replays
- Database transactions eliminate race conditions
- **Overall Risk:** 🟢 LOW

---

## Testing Procedures

### Test 1: Signer Mismatch Detection

```bash
# 1. Get a valid transaction from Wallet A
TX_HASH="<valid_tx_from_wallet_A>"

# 2. Try to use it with Wallet B
curl -X POST http://localhost:5000/api/pools/74/claim-refund \
  -H "Content-Type: application/json" \
  -d "{
    \"wallet\": \"WALLET_B_ADDRESS\",
    \"txHash\": \"$TX_HASH\",
    \"signature\": \"WALLET_B_SIGNATURE\",
    \"message\": \"claim-refund:74:$(date +%s)000\"
  }"

# Expected: 400 "Transaction signer does not match your wallet."
```

### Test 2: Replay Attack (Current Vulnerability)

```bash
# 1. Submit valid claim
curl -X POST http://localhost:5000/api/pools/74/claim-refund \
  -H "Content-Type: application/json" \
  -d "{
    \"wallet\": \"VALID_WALLET\",
    \"txHash\": \"VALID_TX\",
    \"signature\": \"VALID_SIGNATURE\",
    \"message\": \"claim-refund:74:1704712800000\"
  }"
# Expected: 200 { "success": true }

# 2. Wait 1 second, submit SAME request
curl -X POST http://localhost:5000/api/pools/74/claim-refund \
  -H "Content-Type: application/json" \
  -d "{
    \"wallet\": \"VALID_WALLET\",
    \"txHash\": \"VALID_TX\",
    \"signature\": \"VALID_SIGNATURE\",
    \"message\": \"claim-refund:74:1704712800000\"
  }"

# Current: 409 "Refund already claimed" (if no race condition)
# Desired: 409 "Transaction hash already used" (with tx tracking)
```

### Test 3: Old Transaction Replay

```bash
# 1. Get a transaction from 10 minutes ago
OLD_TX_HASH="<transaction_from_10min_ago>"

# 2. Try to use it
curl -X POST http://localhost:5000/api/pools/74/claim-refund \
  -H "Content-Type: application/json" \
  -d "{
    \"wallet\": \"VALID_WALLET\",
    \"txHash\": \"$OLD_TX_HASH\",
    \"signature\": \"VALID_SIGNATURE\",
    \"message\": \"claim-refund:74:$(date +%s)000\"
  }"

# Expected: 400 "Transaction is too old. Please submit a new transaction."
```

---

**Audit Date:** 2026-01-08
**Auditor:** Claude (Anthropic)
**Severity:** 🟡 MEDIUM (signer check ✅, replay prevention ⚠️)
**Recommended Action:** Implement transaction hash tracking ASAP
