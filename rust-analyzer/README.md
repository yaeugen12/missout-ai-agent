# 🦀 Rust Token Analyzer

High-performance token safety analysis for Missout platform.

## Overview

This Rust binary provides autonomous token safety analysis by examining on-chain data and detecting risk patterns:

- **Whale concentration** - Detects tokens controlled by few wallets
- **Coordinated pumps** - Identifies suspicious rapid transaction patterns
- **Bot activity** - Detects automated trading behavior
- **Risk scoring** - Calculates safety score (0-100)
- **Autonomous recommendations** - Provides clear guidance

## Building

```bash
cd rust-analyzer
cargo build --release
```

## Usage

### Standalone

```bash
./target/release/analyze-token <MINT_ADDRESS>
```

### From TypeScript

```typescript
import { getMissoutAgent } from './agents';

const agent = getMissoutAgent();
const analysis = await agent.analyzeTokenSafety('MINT_ADDRESS');

console.log(analysis);
// {
//   safeScore: 72,
//   riskLevel: "low",
//   recommendation: "✅ SAFE - Token appears legitimate...",
//   reasons: [...],
//   metrics: {...}
// }
```

## Output Format

```json
{
  "success": true,
  "data": {
    "mint_address": "...",
    "safe_score": 72.5,
    "risk_level": "low",
    "recommendation": "✅ SAFE - Token appears legitimate. Proceed with normal caution.",
    "reasons": [
      "✓ Healthy distribution: 28.3% top 3 holders",
      "✓ Strong holder base: 247 holders",
      "✓ Active trading volume"
    ],
    "metrics": {
      "whale_concentration": 28.3,
      "holder_count": 247,
      "transaction_count": 156,
      "top_holder_percent": 12.4,
      "bonding_curve_progress": 85.2,
      "bot_activity_detected": false,
      "coordinated_pump": false
    }
  }
}
```

## Risk Levels

- **low** (70-100): Safe to proceed
- **medium** (50-69): Exercise caution
- **high** (30-49): Significant red flags
- **critical** (0-29): Do not use

## Detection Algorithms

### Whale Concentration

Calculates percentage of supply held by top 3 wallets:
- >80% = CRITICAL (-60 points)
- >60% = HIGH RISK (-40 points)
- >40% = RISKY (-20 points)
- <30% = HEALTHY (+0 points)

### Coordinated Pump

Detects rapid successive transactions:
- 5+ transactions in <10 seconds = COORDINATED (-50 points)

### Bot Activity

Identifies regular transaction intervals:
- Same interval repeated 5+ times = BOT (-25 points)

### Holder Count

- <10 holders = TOO FEW (-20 points)
- <50 holders = LOW (-10 points)
- >500 holders = STRONG (+10 points)

## Integration with Missout

The Rust analyzer is called by the **TokenSafetyAgent** when:

1. User creates a new pool with custom token
2. Agent automatically analyzes token safety
3. Warning displayed if high risk detected
4. User can choose to proceed or cancel

## Performance

- **Analysis time**: <2 seconds
- **RPC calls**: 2 (token holders + transactions)
- **Memory**: <10MB
- **Caching**: 5-minute TTL in TypeScript layer

## Environment

Set Solana RPC URL:

```bash
export SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
```

Or configure in server/.env

## Future Enhancements

- [ ] More sophisticated bot detection
- [ ] Historical price analysis
- [ ] Creator wallet tracking
- [ ] Liquidity pool analysis
- [ ] Machine learning risk models
