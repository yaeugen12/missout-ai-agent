# 📡 API Reference

Complete API documentation for Missout platform + AI Agent Layer.

**Base URL**: https://www.missout.fun/api  
**Local Dev**: http://localhost:5000/api

---

## 🤖 AI Agent Endpoints

### GET `/api/agent/status`
Get agent status and metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "running": true,
    "metrics": {
      "poolsMonitored": 45,
      "decisionsExecuted": 12,
      "fraudDetected": 3,
      "uptimeSeconds": 3600
    },
    "subAgents": {
      "poolOrchestrator": { "running": true },
      "securityAgent": { "running": true },
      "analyticsAgent": { "running": true },
      "tokenSafetyAgent": { "running": true }
    }
  }
}
```

---

### GET `/api/agent/analytics`
Get real-time analytics and predictions.

**Response:**
```json
{
  "success": true,
  "data": {
    "currentMetrics": {
      "totalPools": 145,
      "activePools": 12,
      "totalTransactions": 456,
      "totalVolume": 123456.78,
      "uniqueParticipants": 89,
      "averagePoolSize": 3.14
    },
    "recentInsights": [
      {
        "type": "pool_activity",
        "trend": "increasing",
        "change": 15.3,
        "description": "Pool activity increased by 15.3%",
        "confidence": 0.85
      }
    ],
    "predictions": [
      {
        "prediction": "New pools have 65% chance of reaching minimum participation",
        "probability": 0.75,
        "timeframe": "24 hours"
      }
    ]
  }
}
```

---

### GET `/api/agent/security`
Get security report and incidents.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalIncidents": 15,
    "unresolvedIncidents": 2,
    "incidentsBySeverity": {
      "critical": 1,
      "high": 3,
      "medium": 8,
      "low": 3
    },
    "recentIncidents": [
      {
        "type": "rapid_transactions",
        "severity": "high",
        "description": "5 rapid transactions detected from same wallet",
        "timestamp": "2026-02-04T00:00:00Z"
      }
    ]
  }
}
```

---

### POST `/api/agent/analyze-token`
Analyze token safety using AI (Rust + Claude).

**Request:**
```json
{
  "mintAddress": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "mintAddress": "EPjF...",
    "safeScore": 85.5,
    "riskLevel": "low",
    "recommendation": "✅ SAFE - Token appears legitimate. Proceed with normal caution.",
    "aiRecommendation": "This token shows healthy distribution with 847 holders...",
    "aiConfidence": 85,
    "reasons": [
      "✓ Healthy distribution: 24.5% top 3 holders",
      "✓ Strong holder base: 847 holders",
      "✓ Active trading volume"
    ],
    "metrics": {
      "whaleConcentration": 24.5,
      "holderCount": 847,
      "transactionCount": 1234,
      "topHolderPercent": 9.2,
      "tokenAgeHours": 168.5,
      "botActivityDetected": false,
      "coordinatedPump": false,
      "distributionTop10": 45.2
    }
  }
}
```

**Risk Levels:**
- `low` (70-100) - Safe to use
- `medium` (50-69) - Exercise caution
- `high` (30-49) - Significant red flags
- `critical` (0-29) - Do not use

---

### GET `/api/agent/dashboard`
Get complete dashboard data (combines status + analytics + security).

**Response:**
```json
{
  "success": true,
  "data": {
    "agent": { ...status... },
    "analytics": { ...analytics... },
    "security": { ...security... },
    "timestamp": "2026-02-04T00:00:00Z"
  }
}
```

---

## 🎰 Pool Endpoints

### GET `/api/pools`
Get all pools (with optional filters).

**Query Params:**
- `status` - `active`, `locked`, `completed`
- `limit` - Max results (default: 50)

**Response:**
```json
{
  "success": true,
  "pools": [
    {
      "id": 123,
      "tokenSymbol": "BONK",
      "tokenName": "Bonk",
      "tokenMint": "DezX...",
      "entryAmount": 1000000,
      "minParticipants": 2,
      "maxParticipants": 10,
      "participantsCount": 7,
      "status": "active",
      "lockDuration": 3600,
      "totalPot": 7000000,
      "creatorWallet": "ABC...",
      "startTime": "2026-02-04T00:00:00Z"
    }
  ]
}
```

---

### GET `/api/pools/:id`
Get single pool details.

**Response:**
```json
{
  "success": true,
  "pool": { ...pool data... },
  "participants": [
    {
      "wallet": "ABC123...",
      "joinedAt": "2026-02-04T00:00:00Z",
      "referredBy": "XYZ789..."
    }
  ],
  "transactions": [...]
}
```

---

### POST `/api/pools`
Create new pool (requires wallet signature).

**Request:**
```json
{
  "tokenMint": "EPjF...",
  "entryAmount": 1000000,
  "minParticipants": 2,
  "maxParticipants": 10,
  "lockDuration": 3600,
  "creatorWallet": "ABC...",
  "signature": "..."
}
```

---

### POST `/api/pools/:id/join`
Join existing pool.

**Request:**
```json
{
  "wallet": "ABC...",
  "signature": "...",
  "referralCode": "REF123" // optional
}
```

---

### POST `/api/pools/:id/lock`
Trigger pool lock (admin/VRF only).

---

### POST `/api/pools/:id/winner`
Select winner (admin/VRF only).

---

## 👤 Profile Endpoints

### GET `/api/profile/:wallet`
Get user profile.

**Response:**
```json
{
  "wallet": "ABC...",
  "username": "CryptoTrader",
  "avatar": "https://...",
  "totalWins": 5,
  "totalPools": 23,
  "referralCode": "REF123",
  "referralEarnings": 1.25
}
```

---

### PUT `/api/profile`
Update profile (requires signature).

**Request:**
```json
{
  "wallet": "ABC...",
  "username": "NewName",
  "avatar": "https://...",
  "signature": "..."
}
```

---

## 🏆 Leaderboard Endpoints

### GET `/api/leaderboard`
Get top players.

**Query Params:**
- `timeframe` - `all`, `month`, `week`
- `limit` - Max results (default: 100)

**Response:**
```json
{
  "success": true,
  "leaderboard": [
    {
      "rank": 1,
      "wallet": "ABC...",
      "username": "TopPlayer",
      "totalWins": 45,
      "totalWinnings": 123.45,
      "winRate": 65.2
    }
  ]
}
```

---

## 💰 Referral Endpoints

### GET `/api/referrals/:wallet`
Get referral stats.

**Response:**
```json
{
  "code": "REF123",
  "totalReferrals": 25,
  "totalEarnings": 5.67,
  "referredUsers": [
    {
      "wallet": "XYZ...",
      "joinedAt": "2026-02-04T00:00:00Z",
      "earnings": 0.23
    }
  ]
}
```

---

### POST `/api/referrals/claim`
Claim referral earnings.

**Request:**
```json
{
  "wallet": "ABC...",
  "signature": "..."
}
```

---

## 🎁 Donation Endpoints

### GET `/api/donations/campaigns`
Get active donation campaigns.

---

### POST `/api/donations/:campaignId/donate`
Make donation.

**Request:**
```json
{
  "wallet": "ABC...",
  "amount": 1.5,
  "signature": "..."
}
```

---

## 🔔 Notification Endpoints

### GET `/api/notifications/:wallet`
Get notifications for wallet.

**Response:**
```json
{
  "notifications": [
    {
      "type": "pool_locked",
      "poolId": 123,
      "message": "Pool #123 (BONK) has been locked!",
      "timestamp": "2026-02-04T00:00:00Z",
      "read": false
    }
  ]
}
```

---

### POST `/api/notifications/:id/read`
Mark notification as read.

---

## 📊 Health & Status

### GET `/health`
Server health check.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-04T00:00:00Z",
  "uptime": 86400,
  "database": "connected",
  "redis": { "connected": true },
  "rpc": {
    "connected": true,
    "currentSlot": 123456789
  },
  "agent": {
    "running": true,
    "metrics": {...}
  }
}
```

---

## 🔧 Utility Endpoints

### GET `/api/token-info/:mint`
Get token metadata.

**Response:**
```json
{
  "mint": "EPjF...",
  "symbol": "USDC",
  "name": "USD Coin",
  "decimals": 6,
  "logoUrl": "https://...",
  "priceUsd": 1.0
}
```

---

### GET `/api/token-price/:mint`
Get current token price.

**Response:**
```json
{
  "mint": "EPjF...",
  "priceUsd": 1.0,
  "source": "Helius",
  "timestamp": "2026-02-04T00:00:00Z"
}
```

---

## 🎮 WebSocket Events

### Connect
```javascript
const socket = io('https://www.missout.fun');
```

### Events

**`notification`** - Real-time notifications
```javascript
socket.on('notification', (data) => {
  // { type, poolId, message, timestamp }
});
```

**`pool_locked`** - Pool lock event
```javascript
socket.on('pool_locked', (poolId) => {
  // Pool {poolId} has been locked
});
```

**`winner_selected`** - Winner announcement
```javascript
socket.on('winner_selected', (data) => {
  // { poolId, winner, amount }
});
```

---

## 🔐 Authentication

Most write operations require **wallet signature**:

```javascript
const message = `Missout action: ${action}\nTimestamp: ${Date.now()}`;
const signature = await wallet.signMessage(message);

fetch('/api/endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    wallet: publicKey.toString(),
    signature: bs58.encode(signature),
    ...data
  })
});
```

---

## ⚡ Rate Limits

- **General API**: 100 requests/minute
- **Agent endpoints**: Unlimited (read-only)
- **Pool creation**: 10 requests/5 minutes
- **Profile updates**: 5 requests/minute

---

## 🐛 Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message here",
  "code": "ERROR_CODE"
}
```

**Common error codes:**
- `INVALID_SIGNATURE` - Wallet signature verification failed
- `INSUFFICIENT_BALANCE` - Not enough tokens
- `POOL_FULL` - Max participants reached
- `POOL_LOCKED` - Pool already locked
- `TOKEN_NOT_FOUND` - Invalid token mint
- `ANALYSIS_FAILED` - Token analysis error

---

## 📝 Notes

- All amounts are in token's **smallest unit** (lamports for SOL, micro for 6-decimal tokens)
- Timestamps are **ISO 8601** format
- Wallet addresses are **base58** encoded
- All responses include `success: true/false` field

---

**For more details, see:**
- [QUICKSTART.md](QUICKSTART.md) - Getting started
- [PLATFORM_OVERVIEW.md](PLATFORM_OVERVIEW.md) - Architecture deep dive
