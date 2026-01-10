import { Connection, PublicKey } from "@solana/web3.js";
import { rpcManager } from "./rpc-manager.js";

const HELIUS_RPC_URL = process.env.VITE_SOLANA_RPC_PRIMARY || process.env.VITE_SOLANA_RPC_FALLBACK || "";

export type TokenCategory = "new_pairs" | "final_stretch" | "migrated";

export interface DiscoveredToken {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoUrl?: string;
  category: TokenCategory;
  detectedAt: number;
  ageSeconds: number;
  blockTime?: number;
  slot?: number;
  supply?: string;
  recentActivity?: number;
  hasDexInteraction?: boolean;
  hasLiquidityPool?: boolean;
}

interface SignatureInfo {
  signature: string;
  slot: number;
  blockTime: number | null;
}

interface TokenMintInfo {
  mint: string;
  firstSeenSlot: number;
  firstSeenTime: number;
  recentTxCount: number;
  hasDexInteraction: boolean;
  hasLiquidityPool: boolean;
}

const discoveredTokens: Map<string, DiscoveredToken> = new Map();
let lastDiscoveryTime = 0;
const CACHE_TTL = 15000;
let isRefreshing = false;

const DEX_PROGRAMS = new Set([
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
  "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP",
  "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX",
]);

async function fetchTokenMetadata(mintAddress: string): Promise<{name: string; symbol: string; decimals: number; logoUrl?: string; supply?: string}> {
  try {
    const response = await fetch(HELIUS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "metadata",
        method: "getAsset",
        params: { id: mintAddress }
      })
    });
    
    const data = await response.json();
    
    if ((data as any).result?.content?.metadata) {
      const meta = (data as any).result.content.metadata;
      const files = (data as any).result.content.files || [];
      const logoUrl = files[0]?.cdn_uri || files[0]?.uri;
      
      return {
        name: meta.name || "Unknown Token",
        symbol: meta.symbol || mintAddress.slice(0, 6).toUpperCase(),
        decimals: (data as any).result.token_info?.decimals || 9,
        logoUrl,
        supply: (data as any).result.token_info?.supply
      };
    }
    
    return {
      name: "Unknown Token",
      symbol: mintAddress.slice(0, 6).toUpperCase(),
      decimals: 9
    };
  } catch (err) {
    return {
      name: "Unknown Token",
      symbol: mintAddress.slice(0, 6).toUpperCase(),
      decimals: 9
    };
  }
}

function classifyToken(token: DiscoveredToken): TokenCategory {
  if (token.hasLiquidityPool) {
    return "migrated";
  }
  
  if (token.hasDexInteraction) {
    return "final_stretch";
  }
  
  const now = Date.now();
  const ageMinutes = (now - token.detectedAt) / 60000;
  const activity = token.recentActivity || 0;
  
  if (activity >= 10) {
    return "final_stretch";
  }
  
  if (ageMinutes <= 30) {
    return "new_pairs";
  }
  
  if (ageMinutes > 30 && activity >= 5) {
    return "final_stretch";
  }
  
  return "new_pairs";
}

async function refreshTokens(): Promise<void> {
  if (isRefreshing || !HELIUS_RPC_URL) return;
  isRefreshing = true;
  
  console.log("[tokenDiscoveryService] Refreshing tokens from Helius...");

  try {
    const connection = rpcManager.getConnection();
    // Use getLatestBlockhash to check connectivity instead of relying on specific DAS methods if URL is just RPC
    try {
      await connection.getLatestBlockhash();
    } catch (e) {
       console.error("[tokenDiscoveryService] RPC connectivity check failed");
       return;
    }
    
    const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    
    const signatures = await connection.getSignaturesForAddress(TOKEN_PROGRAM_ID, { limit: 50 });
    const sigInfos: SignatureInfo[] = signatures.map(sig => ({
      signature: sig.signature,
      slot: sig.slot,
      blockTime: sig.blockTime ?? null
    }));
    
    const mintMap = new Map<string, TokenMintInfo>();
    
    const batchSize = 5;
    for (let i = 0; i < Math.min(sigInfos.length, 20); i += batchSize) {
      const batch = sigInfos.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (sig) => {
        try {
          const tx = await connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0
          });
          
          if (!tx) return;
          
          let hasDexInteraction = false;
          let hasLiquidityPool = false;
          
          const accountKeys = tx.transaction?.message?.accountKeys || [];
          for (const key of accountKeys) {
            const pubkey = typeof key === 'string' ? key : key.pubkey?.toBase58();
            if (pubkey && DEX_PROGRAMS.has(pubkey)) {
              hasDexInteraction = true;
              if (pubkey.includes("675kPX") || pubkey.includes("LBUZKh") || pubkey.includes("whirLb")) {
                hasLiquidityPool = true;
              }
              break;
            }
          }
          
          if (tx?.meta?.postTokenBalances) {
            for (const balance of tx.meta.postTokenBalances) {
              if (balance.mint) {
                const existing = mintMap.get(balance.mint);
                if (existing) {
                  existing.recentTxCount++;
                  existing.hasDexInteraction = existing.hasDexInteraction || hasDexInteraction;
                  existing.hasLiquidityPool = existing.hasLiquidityPool || hasLiquidityPool;
                  if (sig.slot < existing.firstSeenSlot) {
                    existing.firstSeenSlot = sig.slot;
                    existing.firstSeenTime = sig.blockTime || Math.floor(Date.now() / 1000);
                  }
                } else {
                  mintMap.set(balance.mint, {
                    mint: balance.mint,
                    firstSeenSlot: sig.slot,
                    firstSeenTime: sig.blockTime || Math.floor(Date.now() / 1000),
                    recentTxCount: 1,
                    hasDexInteraction,
                    hasLiquidityPool
                  });
                }
              }
            }
          }
        } catch (err) {
        }
      }));
    }
    
    const mints = Array.from(mintMap.values());
    mints.sort((a, b) => b.recentTxCount - a.recentTxCount);
    
    const now = Date.now();
    
    for (const mintInfo of mints.slice(0, 30)) {
      if (discoveredTokens.has(mintInfo.mint)) {
        const existing = discoveredTokens.get(mintInfo.mint)!;
        existing.recentActivity = mintInfo.recentTxCount;
        existing.ageSeconds = Math.floor((now - existing.detectedAt) / 1000);
        existing.hasDexInteraction = existing.hasDexInteraction || mintInfo.hasDexInteraction;
        existing.hasLiquidityPool = existing.hasLiquidityPool || mintInfo.hasLiquidityPool;
        existing.category = classifyToken(existing);
        continue;
      }
      
      try {
        const metadata = await fetchTokenMetadata(mintInfo.mint);
        
        const token: DiscoveredToken = {
          mint: mintInfo.mint,
          name: metadata.name,
          symbol: metadata.symbol,
          decimals: metadata.decimals,
          logoUrl: metadata.logoUrl,
          supply: metadata.supply,
          detectedAt: mintInfo.firstSeenTime * 1000,
          ageSeconds: Math.floor((now - mintInfo.firstSeenTime * 1000) / 1000),
          blockTime: mintInfo.firstSeenTime,
          slot: mintInfo.firstSeenSlot,
          recentActivity: mintInfo.recentTxCount,
          hasDexInteraction: mintInfo.hasDexInteraction,
          hasLiquidityPool: mintInfo.hasLiquidityPool,
          category: "new_pairs"
        };
        
        token.category = classifyToken(token);
        discoveredTokens.set(mintInfo.mint, token);
        
      } catch (err) {
        console.warn("[tokenDiscoveryService] Failed to fetch metadata for:", mintInfo.mint);
      }
    }
    
    lastDiscoveryTime = now;
    console.log("[tokenDiscoveryService] Refresh complete. Total tokens:", discoveredTokens.size);
    
  } catch (err) {
    console.error("[tokenDiscoveryService] Refresh failed:", err);
  } finally {
    isRefreshing = false;
  }
}

function updateAges(tokens: DiscoveredToken[]): DiscoveredToken[] {
  const now = Date.now();
  return tokens.map(t => ({
    ...t,
    ageSeconds: Math.floor((now - t.detectedAt) / 1000)
  }));
}

export interface TokenDiscoveryService {
  getTokens(): Promise<DiscoveredToken[]>;
  getTokensSync(): DiscoveredToken[];
  searchToken(mintAddress: string): Promise<DiscoveredToken | null>;
  startBackgroundRefresh(intervalMs?: number): void;
  stop(): void;
  getLastRefreshTime(): number;
  getCacheStats(): {
    tokenCount: number;
    lastRefresh: number;
    isRefreshing: boolean;
  };
  refreshIntervalId: NodeJS.Timeout | null;
}

export const tokenDiscoveryService: TokenDiscoveryService = {
  async getTokens(): Promise<DiscoveredToken[]> {
    const now = Date.now();
    
    if (now - lastDiscoveryTime > CACHE_TTL || discoveredTokens.size === 0) {
      await refreshTokens();
    }
    
    return updateAges(Array.from(discoveredTokens.values()));
  },
  
  getTokensSync(): DiscoveredToken[] {
    return updateAges(Array.from(discoveredTokens.values()));
  },
  
  async searchToken(mintAddress: string): Promise<DiscoveredToken | null> {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mintAddress)) {
      return null;
    }
    
    try {
      const metadata = await fetchTokenMetadata(mintAddress);
      const now = Date.now();
      
      return {
        mint: mintAddress,
        name: metadata.name,
        symbol: metadata.symbol,
        decimals: metadata.decimals,
        logoUrl: metadata.logoUrl,
        supply: metadata.supply,
        detectedAt: now,
        ageSeconds: 0,
        category: "new_pairs"
      };
    } catch (err) {
      console.error("[tokenDiscoveryService] Search failed:", err);
      return null;
    }
  },
  
  refreshIntervalId: null as NodeJS.Timeout | null,

  startBackgroundRefresh(intervalMs: number = 10000) {
    console.log("[tokenDiscoveryService] Starting background refresh every", intervalMs, "ms");

    refreshTokens();

    this.refreshIntervalId = setInterval(() => {
      refreshTokens();
    }, intervalMs);
  },

  stop() {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
      console.log("[tokenDiscoveryService] ✅ Background refresh stopped");
    }
  },
  
  getLastRefreshTime(): number {
    return lastDiscoveryTime;
  },
  
  getCacheStats() {
    return {
      tokenCount: discoveredTokens.size,
      lastRefresh: lastDiscoveryTime,
      isRefreshing
    };
  }
};
