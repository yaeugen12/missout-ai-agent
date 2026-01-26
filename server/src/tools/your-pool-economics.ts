/**
 * Your Pool Economics
 *
 * Settings: $5 minimum bet, 2-20 participants
 */

import { calculatePoolEconomics, formatEconomicsReport } from "./pool-economics-calculator";

const SOL_PRICE = 150; // USD

console.log("\n💰 YOUR POOL ECONOMICS (Min $5 bet, 2-20 participants)\n");

// Worst case: 2 participants × $5 = $10 pot
// Assuming token price $0.50, need 10 tokens
const worstCase = calculatePoolEconomics(20, 0.50, SOL_PRICE, 500);
console.log("📉 WORST CASE: 2 participants × $5 = $10 pot");
console.log(formatEconomicsReport(worstCase));
console.log("\n");

// Average case: 10 participants × $5 = $50 pot
// Assuming token price $0.50, need 100 tokens
const avgCase = calculatePoolEconomics(100, 0.50, SOL_PRICE, 500);
console.log("📊 AVERAGE CASE: 10 participants × $5 = $50 pot");
console.log(formatEconomicsReport(avgCase));
console.log("\n");

// Best case: 20 participants × $5 = $100 pot
// Assuming token price $0.50, need 200 tokens
const bestCase = calculatePoolEconomics(200, 0.50, SOL_PRICE, 500);
console.log("📈 BEST CASE: 20 participants × $5 = $100 pot");
console.log(formatEconomicsReport(bestCase));
console.log("\n");

// Analysis
console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║                      YOUR SITUATION                        ║");
console.log("╠════════════════════════════════════════════════════════════╣");
console.log(`║ Worst case (2p × $5):     ${worstCase.isProfit ? "✅ Profit" : "❌ Loss"}  $${Math.abs(worstCase.netProfitUSD).toFixed(2).padStart(6)} ║`);
console.log(`║ Average case (10p × $5):  ${avgCase.isProfit ? "✅ Profit" : "❌ Loss"}  $${Math.abs(avgCase.netProfitUSD).toFixed(2).padStart(6)} ║`);
console.log(`║ Best case (20p × $5):     ${bestCase.isProfit ? "✅ Profit" : "❌ Loss"}  $${Math.abs(bestCase.netProfitUSD).toFixed(2).padStart(6)} ║`);
console.log("╠════════════════════════════════════════════════════════════╣");
console.log("║                      SOLUTION OPTIONS                      ║");
console.log("╠════════════════════════════════════════════════════════════╣");

// Option 1: Increase dev fee to 10%
const worstCase10 = calculatePoolEconomics(20, 0.50, SOL_PRICE, 1000);
const avgCase10 = calculatePoolEconomics(100, 0.50, SOL_PRICE, 1000);
const bestCase10 = calculatePoolEconomics(200, 0.50, SOL_PRICE, 1000);

console.log("║ OPTION 1: Increase dev fee from 5% to 10%                 ║");
console.log(`║   Worst (2p):  ${worstCase10.isProfit ? "✅" : "❌"} $${worstCase10.netProfitUSD.toFixed(2).padStart(6)} profit ║`);
console.log(`║   Average(10p): ${avgCase10.isProfit ? "✅" : "❌"} $${avgCase10.netProfitUSD.toFixed(2).padStart(6)} profit ║`);
console.log(`║   Best (20p):  ${bestCase10.isProfit ? "✅" : "❌"} $${bestCase10.netProfitUSD.toFixed(2).padStart(6)} profit ║`);
console.log("║                                                            ║");

// Option 2: Minimum 5 participants
const min5 = calculatePoolEconomics(50, 0.50, SOL_PRICE, 500);
console.log("║ OPTION 2: Increase minimum to 5 participants (keep 5%)    ║");
console.log(`║   Min pot: 5p × $5 = $25                                   ║`);
console.log(`║   Profit: ${min5.isProfit ? "✅" : "❌"} $${min5.netProfitUSD.toFixed(2).padStart(6)}                              ║`);
console.log("║                                                            ║");

// Option 3: Minimum 3 participants + 7% fee
const min3_7pct = calculatePoolEconomics(30, 0.50, SOL_PRICE, 700);
console.log("║ OPTION 3: Min 3 participants + 7% dev fee                 ║");
console.log(`║   Min pot: 3p × $5 = $15                                   ║`);
console.log(`║   Profit: ${min3_7pct.isProfit ? "✅" : "❌"} $${min3_7pct.netProfitUSD.toFixed(2).padStart(6)}                              ║`);
console.log("║                                                            ║");

console.log("║ 💡 RECOMMENDED: Option 1 (10% dev fee)                     ║");
console.log("║    - Simplest change (just update devFeeBps: 1000)         ║");
console.log("║    - Profitable even with 2 participants                   ║");
console.log("║    - Still competitive (10% is reasonable for degen pools) ║");
console.log("║    - Winner still gets 85% (vs 90% with 5% fee)            ║");
console.log("╚════════════════════════════════════════════════════════════╝");

console.log("\n📝 TO IMPLEMENT 10% DEV FEE:\n");
console.log("Edit: missout/client/src/components/CreatePoolWizard.tsx:212");
console.log("Change:");
console.log("  devFeeBps: 500,  // 5% to dev wallet");
console.log("To:");
console.log("  devFeeBps: 1000,  // 10% to dev wallet");
console.log("");
console.log("This ensures you profit on EVERY pool, even small ones!");
