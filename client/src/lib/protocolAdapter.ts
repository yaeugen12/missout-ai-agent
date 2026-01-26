import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { getConnection } from "./solana-sdk/connection";

export interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoUrl?: string;
  supply?: string;
  metadataFound: boolean;
  error?: string;
}

export interface TokenPriceData {
  priceUsd: number;
  marketCapUsd?: number;
  liquidityUsd?: number;
  source: string;
  allPrices?: { source: string; price: number; marketCap?: number; liquidity?: number }[];
  priceDiscrepancy?: boolean;
}

export interface PoolCreateParams {
  tokenSymbol: string;
  tokenName: string;
  entryAmount: number;
  minParticipants: number;
  maxParticipants: number;
  lockDuration: number;
  creatorWallet: string;
}

const HELIUS_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || import.meta.env.VITE_SOLANA_RPC_FALLBACK;

const KNOWN_TOKENS: Record<string, { name: string; symbol: string; logoUrl: string }> = {
  "So11111111111111111111111111111111111111112": {
    name: "Wrapped SOL",
    symbol: "SOL",
    logoUrl: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
  },
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": {
    name: "USD Coin",
    symbol: "USDC",
    logoUrl: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png"
  },
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": {
    name: "Bonk",
    symbol: "BONK",
    logoUrl: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I"
  }
};

export const protocolAdapter = {
  isValidSolanaAddress(address: string): boolean {
    try {
      const decoded = bs58.decode(address);
      return decoded.length === 32;
    } catch (e) {
      return false;
    }
  },

  async fetchTokenInfo(mintAddress: string): Promise<TokenInfo> {
    const connection = getConnection();
    
    console.log("[protocolAdapter] Fetching token info for:", mintAddress);
    console.log("[protocolAdapter] Using unified Connection instance");
    
    try {
      const mintPubkey = new PublicKey(mintAddress);
      
      // Step 1: Get account info first to check if account exists
      console.log("[protocolAdapter] Step 1: Fetching account info...");
      const accountInfo = await connection.getAccountInfo(mintPubkey);
      
      if (!accountInfo) {
        console.error("[protocolAdapter] Account does not exist");
        throw new Error("Account not found. This mint address does not exist on Solana.");
      }
      
      console.log("[protocolAdapter] Account exists, owner:", accountInfo.owner.toBase58());
      console.log("[protocolAdapter] Account data length:", accountInfo.data.length);
      
      // Step 2: Check if it's a token mint (owner should be Token Program)
      const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
      const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
      const ownerStr = accountInfo.owner.toBase58();
      
      const isTokenProgram = ownerStr === TOKEN_PROGRAM_ID || ownerStr === TOKEN_2022_PROGRAM_ID;
      
      if (!isTokenProgram) {
        console.error("[protocolAdapter] Not a token mint, owner is:", ownerStr);
        throw new Error("Invalid token mint. This address is not an SPL token.");
      }
      
      // Step 3: Parse mint data manually (to avoid getMint issues)
      // Mint account layout: mintAuthorityOption (4) + mintAuthority (32) + supply (8) + decimals (1) + isInitialized (1) + freezeAuthorityOption (4) + freezeAuthority (32)
      let decimals = 9; // Default
      let supply = "0";
      
      try {
        const data = accountInfo.data;
        if (data.length >= 45) {
          decimals = data[44]; // decimals is at byte 44
          // Supply is at bytes 36-43 (8 bytes, little endian)
          const supplyBytes = data.slice(36, 44);
          const supplyBigInt = BigInt(supplyBytes[0]) |
            (BigInt(supplyBytes[1]) << BigInt(8)) |
            (BigInt(supplyBytes[2]) << BigInt(16)) |
            (BigInt(supplyBytes[3]) << BigInt(24)) |
            (BigInt(supplyBytes[4]) << BigInt(32)) |
            (BigInt(supplyBytes[5]) << BigInt(40)) |
            (BigInt(supplyBytes[6]) << BigInt(48)) |
            (BigInt(supplyBytes[7]) << BigInt(56));
          supply = supplyBigInt.toString();
        }
        console.log("[protocolAdapter] Parsed decimals:", decimals, "supply:", supply);
      } catch (parseErr) {
        console.warn("[protocolAdapter] Could not parse mint data, using defaults:", parseErr);
      }
      
      // Step 4: Check for known token metadata
      let name = "Unknown Token";
      let symbol = mintAddress.slice(0, 6).toUpperCase();
      let logoUrl: string | undefined = undefined;
      let metadataFound = false;
      
      if (KNOWN_TOKENS[mintAddress]) {
        const known = KNOWN_TOKENS[mintAddress];
        name = known.name;
        symbol = known.symbol;
        logoUrl = known.logoUrl;
        metadataFound = true;
        console.log("[protocolAdapter] Found known token:", name);
      } else {
        // Try to fetch from Helius DAS API for metadata
        try {
          console.log("[protocolAdapter] Trying Helius DAS API for metadata...");
          const dasResponse = await fetch(HELIUS_RPC_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: "get-asset",
              method: "getAsset",
              params: { id: mintAddress }
            })
          });
          const dasData = await dasResponse.json();
          console.log("[protocolAdapter] DAS full response:", JSON.stringify(dasData, null, 2));

          if (dasData.result?.content?.metadata) {
            const meta = dasData.result.content.metadata;
            name = meta.name || name;
            symbol = meta.symbol || symbol;

            // Try multiple paths for logo
            const content = dasData.result.content;

            // Path 1: links.image (most common)
            if (content?.links?.image) {
              logoUrl = content.links.image;
              console.log("[protocolAdapter] Found logo via links.image:", logoUrl);
            }
            // Path 2: files[0].uri (NFT style)
            else if (content?.files && content.files.length > 0 && content.files[0].uri) {
              logoUrl = content.files[0].uri;
              console.log("[protocolAdapter] Found logo via files[0].uri:", logoUrl);
            }
            // Path 3: json_uri metadata (needs additional fetch)
            else if (content?.json_uri) {
              console.log("[protocolAdapter] Trying json_uri for metadata:", content.json_uri);
              try {
                const jsonMetaRes = await fetch(content.json_uri);
                const jsonMeta = await jsonMetaRes.json();
                if (jsonMeta.image) {
                  logoUrl = jsonMeta.image;
                  console.log("[protocolAdapter] Found logo via json_uri.image:", logoUrl);
                }
              } catch (jsonErr) {
                console.warn("[protocolAdapter] json_uri fetch failed:", jsonErr);
              }
            }
            // Path 4: Check in metadata.image
            else if (meta.image) {
              logoUrl = meta.image;
              console.log("[protocolAdapter] Found logo via metadata.image:", logoUrl);
            }

            metadataFound = true;
            console.log("[protocolAdapter] Found DAS metadata:", name, symbol, logoUrl ? "with logo" : "no logo");
          } else {
            console.warn("[protocolAdapter] DAS returned no content.metadata");
          }
        } catch (dasErr) {
          console.warn("[protocolAdapter] DAS API failed (this is normal for new tokens):", dasErr);
        }
      }
      
      console.log("[protocolAdapter] Successfully fetched token info");
      
      return {
        mint: mintAddress,
        decimals,
        supply,
        name,
        symbol,
        logoUrl,
        metadataFound
      };
      
    } catch (e: any) {
      console.error("[protocolAdapter] Token fetch error:", e);
      console.error("[protocolAdapter] Error name:", e?.name);
      console.error("[protocolAdapter] Error message:", e?.message);
      
      // Provide more specific error messages
      if (e.message?.includes("Account not found")) {
        throw new Error("Account not found. Check if the mint address is correct.");
      }
      if (e.message?.includes("Invalid token mint")) {
        throw new Error("This address is not a valid SPL token mint.");
      }
      if (e.name === "TokenInvalidAccountOwnerError") {
        throw new Error("Invalid token: This address is not an SPL token mint.");
      }
      if (e.message?.includes("Invalid public key")) {
        throw new Error("Invalid address format. Please enter a valid Solana address.");
      }
      
      throw new Error(`Failed to fetch token: ${e.message || "Unknown error"}`);
    }
  },

  async fetchTokenPriceUsd(mint: string): Promise<TokenPriceData | null> {
    console.log("[protocolAdapter] Fetching price for:", mint);
    console.log("[protocolAdapter] Fetching from ALL sources in parallel for accuracy...");

    // Fetch from all sources in parallel
    const [jupiterResult, heliusResult, birdeyeResult, dexScreenerResult] = await Promise.allSettled([
      // Jupiter API v2
      fetch(`https://api.jup.ag/price/v2?ids=${mint}`)
        .then(async (res) => {
          if (!res.ok) return null;
          const data = await res.json();
          const price = data.data[mint]?.price;
          if (!price) return null;
          console.log("[protocolAdapter] ✓ Jupiter v2:", parseFloat(price));
          return { source: "Jupiter", price: parseFloat(price) };
        })
        .catch(() => null),

      // Helius DAS API
      fetch(HELIUS_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "get-asset-price",
          method: "getAsset",
          params: { id: mint }
        })
      })
        .then(async (res) => {
          const data = await res.json();
          const price = data.result?.token_info?.price_info?.price_per_token;
          const marketCap = data.result?.token_info?.price_info?.total_price;
          if (!price) return null;
          console.log("[protocolAdapter] ✓ Helius:", price, marketCap ? `(mcap: $${(marketCap / 1000000).toFixed(2)}M)` : "");
          return { source: "Helius", price, marketCap };
        })
        .catch(() => null),

      // Birdeye API
      fetch(`https://public-api.birdeye.so/public/price?address=${mint}`, {
        headers: { "X-API-KEY": "public" }
      })
        .then(async (res) => {
          const data = await res.json();
          const price = data.data?.value;
          if (!price) return null;
          console.log("[protocolAdapter] ✓ Birdeye:", price);
          return { source: "Birdeye", price };
        })
        .catch(() => null),

      // DexScreener API (most comprehensive - includes liquidity and market cap)
      fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`)
        .then(async (res) => {
          const data = await res.json();
          if (!data.pairs || data.pairs.length === 0) return null;

          // Get the pair with highest liquidity
          const bestPair = data.pairs.sort((a: any, b: any) =>
            (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
          )[0];

          if (!bestPair.priceUsd) return null;

          const price = parseFloat(bestPair.priceUsd);
          const liquidity = bestPair.liquidity?.usd;
          const marketCap = bestPair.fdv || bestPair.marketCap; // fdv = fully diluted valuation

          console.log(
            "[protocolAdapter] ✓ DexScreener:",
            price,
            marketCap ? `(mcap: $${(marketCap / 1000000).toFixed(2)}M)` : "",
            liquidity ? `(liq: $${(liquidity / 1000).toFixed(2)}K)` : ""
          );

          return { source: "DexScreener", price, marketCap, liquidity };
        })
        .catch(() => null),
    ]);

    // Collect all successful prices
    const allPrices: { source: string; price: number; marketCap?: number; liquidity?: number }[] = [];

    if (jupiterResult.status === "fulfilled" && jupiterResult.value) allPrices.push(jupiterResult.value);
    if (heliusResult.status === "fulfilled" && heliusResult.value) allPrices.push(heliusResult.value);
    if (birdeyeResult.status === "fulfilled" && birdeyeResult.value) allPrices.push(birdeyeResult.value);
    if (dexScreenerResult.status === "fulfilled" && dexScreenerResult.value) allPrices.push(dexScreenerResult.value);

    if (allPrices.length === 0) {
      console.log("[protocolAdapter] ❌ No price data available from any source");
      return null;
    }

    console.log(`[protocolAdapter] 📊 Collected ${allPrices.length} price(s) from different sources`);

    // Analyze price discrepancy
    const prices = allPrices.map((p) => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const discrepancyPercent = ((maxPrice - minPrice) / minPrice) * 100;

    console.log(`[protocolAdapter] 📈 Price range: $${minPrice.toExponential(4)} - $${maxPrice.toExponential(4)}`);
    console.log(`[protocolAdapter] 📊 Average: $${avgPrice.toExponential(4)}, Discrepancy: ${discrepancyPercent.toFixed(2)}%`);

    const hasDiscrepancy = discrepancyPercent > 10; // Flag if prices differ by more than 10%

    if (hasDiscrepancy) {
      console.warn(`[protocolAdapter] ⚠️ HIGH PRICE DISCREPANCY (${discrepancyPercent.toFixed(2)}%)`);
    }

    // Strategy: Prioritize DexScreener if available (most comprehensive with liquidity data)
    // Otherwise use median price from available sources
    let selectedPrice: typeof allPrices[0];
    let selectionReason = "";

    const dexPrice = allPrices.find((p) => p.source === "DexScreener");
    if (dexPrice && dexPrice.liquidity && dexPrice.liquidity > 5000) {
      // Use DexScreener if it has good liquidity (>$5k)
      selectedPrice = dexPrice;
      selectionReason = `highest liquidity ($${(dexPrice.liquidity / 1000).toFixed(2)}K)`;
    } else {
      // Use median price as most reliable
      const sortedPrices = [...allPrices].sort((a, b) => a.price - b.price);
      const medianIndex = Math.floor(sortedPrices.length / 2);
      selectedPrice = sortedPrices[medianIndex];
      selectionReason = "median of all sources";
    }

    console.log(`[protocolAdapter] ✅ Selected ${selectedPrice.source} price: $${selectedPrice.price.toExponential(4)} (${selectionReason})`);

    return {
      priceUsd: selectedPrice.price,
      marketCapUsd: selectedPrice.marketCap,
      liquidityUsd: selectedPrice.liquidity,
      source: selectedPrice.source,
      allPrices,
      priceDiscrepancy: hasDiscrepancy,
    };
  },

  suggestMinEntryAmount(priceUsd: number, minUsd = 5): number {
    if (priceUsd <= 0) return 0;
    return Math.ceil((minUsd / priceUsd) * 100) / 100;
  }
};
