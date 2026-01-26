/**
 * Pool Economics Calculator
 *
 * Calculates DEV_WALLET costs vs revenue for each pool lifecycle.
 * This helps determine if the 5% dev fee is profitable.
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

interface PoolEconomics {
  // Revenue
  devFeeBps: number; // 500 = 5%
  totalPotTokens: number;
  tokenPriceUSD: number;
  devFeeTokens: number;
  devFeeUSD: number;

  // Costs
  transactions: {
    unlock_pool: number; // SOL
    request_randomness: number; // SOL (expensive!)
    reveal_randomness: number; // SOL
    select_winner: number; // SOL
    payout_winner: number; // SOL
  };
  totalCostSOL: number;
  totalCostUSD: number;

  // Net
  netProfitUSD: number;
  profitMargin: number; // percentage
  isProfit: boolean;
}

/**
 * Estimate transaction costs on Solana mainnet
 */
const ESTIMATED_TX_COSTS = {
  // Base compute fees (estimate)
  unlock_pool: 0.000005, // SOL - simple state update
  request_randomness: 0.01, // SOL - EXPENSIVE! Switchboard VRF fee + rent
  reveal_randomness: 0.005, // SOL - Switchboard callback
  select_winner: 0.00001, // SOL - simple computation
  payout_winner: 0.00002, // SOL - token transfer
};

/**
 * Calculate pool economics
 */
export function calculatePoolEconomics(
  totalPotTokens: number,
  tokenPriceUSD: number,
  solPriceUSD: number = 150, // Default SOL price
  devFeeBps: number = 500 // 5%
): PoolEconomics {
  // Revenue calculation
  const devFeeTokens = (totalPotTokens * devFeeBps) / 10000;
  const devFeeUSD = devFeeTokens * tokenPriceUSD;

  // Cost calculation
  const transactions = { ...ESTIMATED_TX_COSTS };
  const totalCostSOL =
    transactions.unlock_pool +
    transactions.request_randomness +
    transactions.reveal_randomness +
    transactions.select_winner +
    transactions.payout_winner;

  const totalCostUSD = totalCostSOL * solPriceUSD;

  // Net profit
  const netProfitUSD = devFeeUSD - totalCostUSD;
  const profitMargin = (netProfitUSD / devFeeUSD) * 100;

  return {
    devFeeBps,
    totalPotTokens,
    tokenPriceUSD,
    devFeeTokens,
    devFeeUSD,
    transactions,
    totalCostSOL,
    totalCostUSD,
    netProfitUSD,
    profitMargin,
    isProfit: netProfitUSD > 0,
  };
}

/**
 * Format economics report
 */
export function formatEconomicsReport(economics: PoolEconomics): string {
  const lines = [
    "╔════════════════════════════════════════════════════════════╗",
    "║           POOL ECONOMICS CALCULATOR (DEV WALLET)           ║",
    "╠════════════════════════════════════════════════════════════╣",
    "║ REVENUE (5% Dev Fee)                                       ║",
    `║   Total Pot:        ${economics.totalPotTokens.toLocaleString()} tokens`,
    `║   Token Price:      $${economics.tokenPriceUSD.toFixed(6)}`,
    `║   Dev Fee (5%):     ${economics.devFeeTokens.toFixed(2)} tokens`,
    `║   Dev Fee USD:      $${economics.devFeeUSD.toFixed(2)} 💰`,
    "╠════════════════════════════════════════════════════════════╣",
    "║ COSTS (Transaction Fees)                                   ║",
    `║   unlock_pool:        ${economics.transactions.unlock_pool.toFixed(6)} SOL`,
    `║   request_randomness: ${economics.transactions.request_randomness.toFixed(6)} SOL ⚠️ EXPENSIVE`,
    `║   reveal_randomness:  ${economics.transactions.reveal_randomness.toFixed(6)} SOL`,
    `║   select_winner:      ${economics.transactions.select_winner.toFixed(6)} SOL`,
    `║   payout_winner:      ${economics.transactions.payout_winner.toFixed(6)} SOL`,
    "║   " + "─".repeat(56) + " ║",
    `║   TOTAL:              ${economics.totalCostSOL.toFixed(6)} SOL`,
    `║   TOTAL USD:          $${economics.totalCostUSD.toFixed(2)} 💸`,
    "╠════════════════════════════════════════════════════════════╣",
    "║ NET PROFIT                                                 ║",
    `║   ${economics.isProfit ? "✅ PROFIT:" : "❌ LOSS:"}        $${Math.abs(economics.netProfitUSD).toFixed(2)}`,
    `║   Margin:             ${economics.profitMargin.toFixed(1)}%`,
    "╚════════════════════════════════════════════════════════════╝",
  ];

  return lines.join("\n");
}

/**
 * Run example scenarios
 */
export function runScenarios() {
  const SOL_PRICE = 150; // USD

  console.log("\n🔍 SCENARIO ANALYSIS: Different Pool Sizes\n");

  // Scenario 1: Small pool (10 participants × 1 token @ $0.01)
  const small = calculatePoolEconomics(10, 0.01, SOL_PRICE);
  console.log(formatEconomicsReport(small));
  console.log("\n");

  // Scenario 2: Medium pool (50 participants × 10 tokens @ $0.05)
  const medium = calculatePoolEconomics(500, 0.05, SOL_PRICE);
  console.log(formatEconomicsReport(medium));
  console.log("\n");

  // Scenario 3: Large pool (100 participants × 100 tokens @ $0.10)
  const large = calculatePoolEconomics(10000, 0.10, SOL_PRICE);
  console.log(formatEconomicsReport(large));
  console.log("\n");

  // Summary
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                      RECOMMENDATIONS                       ║");
  console.log("╠════════════════════════════════════════════════════════════╣");

  if (!small.isProfit) {
    console.log("║ ⚠️  Small pools are NOT profitable with 5% fee!           ║");
    console.log("║     Consider: Minimum pool size or entry fee              ║");
  }

  if (!medium.isProfit) {
    console.log("║ ⚠️  Medium pools are NOT profitable with 5% fee!          ║");
    console.log("║     Consider: Increasing dev fee to 7-10%                 ║");
  }

  console.log("║                                                            ║");
  console.log("║ 💡 Main cost driver: Switchboard VRF (randomness)          ║");
  console.log("║    - request_randomness: ~0.01 SOL (~$1.50)               ║");
  console.log("║    - This is a FIXED cost per pool regardless of size     ║");
  console.log("║                                                            ║");
  console.log("║ 📊 Break-even calculation:                                 ║");
  console.log("║    $1.50 / 0.05 = $30 minimum pot value needed             ║");
  console.log("║                                                            ║");
  console.log("║ 💰 Suggested fixes:                                        ║");
  console.log("║    1. Increase dev fee to 10% (1000 bps)                   ║");
  console.log("║    2. Set minimum pool pot value ($50+)                    ║");
  console.log("║    3. Add creation fee (0.01 SOL paid by creator)          ║");
  console.log("║    4. Batch multiple pools per randomness request          ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
}

// Run scenarios
runScenarios();
