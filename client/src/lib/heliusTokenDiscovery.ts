import { protocolAdapter } from "./protocolAdapter";
import { apiFetch } from "@/lib/api";


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

interface DiscoveryResponse {
  tokens: DiscoveredToken[];
  lastRefresh: number;
  isRefreshing: boolean;
  tokenCount: number;
}

let cachedTokens: DiscoveredToken[] = [];
let lastFetchTime = 0;
const CLIENT_CACHE_TTL = 5000;

export const heliusTokenDiscovery = {
  async discoverRecentTokens(): Promise<DiscoveredToken[]> {
    const now = Date.now();
    
    if (now - lastFetchTime < CLIENT_CACHE_TTL && cachedTokens.length > 0) {
      return this.updateAges(cachedTokens);
    }
    
    console.log("[heliusTokenDiscovery] Fetching from backend API...");
    
    try {
      const response = await apiFetch("/api/discovery/tokens");
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data: DiscoveryResponse = await response.json();
      cachedTokens = data.tokens;
      lastFetchTime = now;
      
      console.log("[heliusTokenDiscovery] Received", data.tokenCount, "tokens from backend");
      
      return this.updateAges(cachedTokens);
      
    } catch (err) {
      console.error("[heliusTokenDiscovery] Backend fetch failed:", err);
      return this.updateAges(cachedTokens);
    }
  },

  updateAges(tokens: DiscoveredToken[]): DiscoveredToken[] {
    const now = Date.now();
    return tokens.map(t => ({
      ...t,
      ageSeconds: Math.floor((now - t.detectedAt) / 1000)
    }));
  },

  async searchToken(mintAddress: string): Promise<DiscoveredToken | null> {
    if (!protocolAdapter.isValidSolanaAddress(mintAddress)) {
      return null;
    }
    
    try {
      const response = await apiFetch(`/api/discovery/tokens/search?mint=${encodeURIComponent(mintAddress)}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Search failed: ${response.status}`);
      }
      
      return await response.json();
    } catch (err) {
      console.error("[heliusTokenDiscovery] Search failed:", err);
      return null;
    }
  },

  filterByCategory(tokens: DiscoveredToken[], category: TokenCategory): DiscoveredToken[] {
    return tokens.filter(t => t.category === category);
  },

  formatAge(seconds: number): string {
    if (seconds < 0) return "0s";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  },

  clearCache() {
    cachedTokens = [];
    lastFetchTime = 0;
  },

  async getStats(): Promise<{tokenCount: number; lastRefresh: number; isRefreshing: boolean} | null> {
    try {
      const response = await apiFetch("/api/discovery/stats");
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
};
