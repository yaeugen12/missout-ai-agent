/**
 * Price fetching utilities for server-side use
 * This is a simplified version that works in Node.js environment
 */

import { logger } from "../logger.js";

/**
 * Fetch token price in USD from multiple sources with fallback
 */
export async function fetchTokenPriceUsd(mint: string): Promise<number | null> {
  logger.debug(`[PriceUtils] Fetching price for: ${mint}`);

  // For pump.fun tokens, prioritize DexScreener (more accurate real-time prices)
  const isPumpToken = mint.toLowerCase().includes('pump');

  if (isPumpToken) {
    // Try DexScreener first for pump.fun tokens (most accurate)
    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      if (response.ok) {
        const data = await response.json();
        if (data.pairs && data.pairs.length > 0) {
          const bestPair = data.pairs.sort((a: any, b: any) =>
            (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
          )[0];

          if (bestPair.priceUsd) {
            const price = parseFloat(bestPair.priceUsd);
            logger.debug(`[PriceUtils] DexScreener price (pump token): $${price}`);
            return price;
          }
        }
      }
    } catch (err) {
      logger.debug(`[PriceUtils] DexScreener failed:`, err);
    }
  }

  // Try Jupiter API v6 first for non-pump tokens (most reliable for Solana tokens)
  try {
    const response = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`);
    if (response.ok) {
      const data = await response.json();
      if (data.data?.[mint]?.price) {
        const price = data.data[mint].price;
        logger.debug(`[PriceUtils] Jupiter price: $${price}`);
        return price;
      }
    }
  } catch (err) {
    logger.debug(`[PriceUtils] Jupiter failed:`, err);
  }

  // Try DexScreener API for non-pump tokens as fallback
  if (!isPumpToken) {
    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      if (response.ok) {
        const data = await response.json();
        if (data.pairs && data.pairs.length > 0) {
          const bestPair = data.pairs.sort((a: any, b: any) =>
            (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
          )[0];

          if (bestPair.priceUsd) {
            const price = parseFloat(bestPair.priceUsd);
            logger.debug(`[PriceUtils] DexScreener price: $${price}`);
            return price;
          }
        }
      }
    } catch (err) {
      logger.debug(`[PriceUtils] DexScreener failed:`, err);
    }
  }

  // Try Helius DAS API as last resort (may have stale prices)
  try {
    const heliusUrl = process.env.VITE_HELIUS_RPC_URL || process.env.HELIUS_RPC_URL;
    if (heliusUrl && !heliusUrl.includes("api-key=YOUR_API_KEY")) {
      const response = await fetch(heliusUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "price-fetch",
          method: "getAsset",
          params: { id: mint },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.result?.token_info?.price_info?.price_per_token) {
          const price = data.result.token_info.price_info.price_per_token;
          logger.debug(`[PriceUtils] Helius DAS price: $${price}`);
          return price;
        }
      }
    }
  } catch (err) {
    logger.debug(`[PriceUtils] Helius DAS failed:`, err);
  }

  // Try Birdeye API (good for new tokens)
  try {
    const birdeyeKey = process.env.BIRDEYE_API_KEY;
    if (birdeyeKey && birdeyeKey !== "YOUR_BIRDEYE_API_KEY") {
      const response = await fetch(
        `https://public-api.birdeye.so/defi/price?address=${mint}`,
        {
          headers: {
            "X-API-KEY": birdeyeKey,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.data?.value) {
          const price = data.data.value;
          logger.debug(`[PriceUtils] Birdeye price: $${price}`);
          return price;
        }
      }
    }
  } catch (err) {
    logger.debug(`[PriceUtils] Birdeye failed:`, err);
  }

  logger.warn(`[PriceUtils] Could not fetch price for ${mint} from any source`);
  return null;
}
