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

export interface PoolCreateParams {
  tokenSymbol: string;
  tokenName: string;
  entryAmount: number;
  minParticipants: number;
  maxParticipants: number;
  lockDuration: number;
  creatorWallet: string;
}

const HELIUS_RPC_URL = import.meta.env.VITE_SOLANA_RPC_PRIMARY || import.meta.env.VITE_SOLANA_RPC_FALLBACK;

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
          console.log("[protocolAdapter] DAS response:", JSON.stringify(dasData).slice(0, 500));
          
          if (dasData.result?.content?.metadata) {
            const meta = dasData.result.content.metadata;
            name = meta.name || name;
            symbol = meta.symbol || symbol;
            if (dasData.result.content?.links?.image) {
              logoUrl = dasData.result.content.links.image;
            }
            metadataFound = true;
            console.log("[protocolAdapter] Found DAS metadata:", name, symbol);
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

  async fetchTokenPriceUsd(mint: string): Promise<number | null> {
    try {
      console.log("[protocolAdapter] Fetching price for:", mint);
      const res = await fetch(`https://price.jup.ag/v4/price?ids=${mint}`);
      const data = await res.json();
      if (data.data && data.data[mint]) {
        console.log("[protocolAdapter] Price found:", data.data[mint].price);
        return data.data[mint].price;
      }
      console.log("[protocolAdapter] No price data available");
      return null;
    } catch (e) {
      console.error("[protocolAdapter] Price fetch failed:", e);
      return null;
    }
  },

  suggestMinEntryAmount(priceUsd: number, minUsd = 5): number {
    if (priceUsd <= 0) return 0;
    return Math.ceil((minUsd / priceUsd) * 100) / 100;
  }
};
