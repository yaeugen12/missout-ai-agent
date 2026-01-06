import { useState, useEffect } from "react";

interface TokenMetadata {
  name: string;
  symbol: string;
  logoUrl?: string;
  mint?: string;
  decimals?: number;
}

const metadataCache = new Map<string, TokenMetadata>();

const KNOWN_TOKENS: Record<string, TokenMetadata> = {
  SOL: {
    name: "Solana",
    symbol: "SOL",
    logoUrl: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    mint: "So11111111111111111111111111111111111111112",
    decimals: 9,
  },
  BONK: {
    name: "Bonk",
    symbol: "BONK",
    logoUrl: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    decimals: 5,
  },
  USDC: {
    name: "USD Coin",
    symbol: "USDC",
    logoUrl: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
  },
  USDT: {
    name: "Tether USD",
    symbol: "USDT",
    logoUrl: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    decimals: 6,
  },
  WIF: {
    name: "dogwifhat",
    symbol: "WIF",
    logoUrl: "https://bafkreibk3covs5ltyqxa272uodhculbr6kea6betidfwy3ajsav2vjzyum.ipfs.nftstorage.link",
    mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    decimals: 6,
  },
  JUP: {
    name: "Jupiter",
    symbol: "JUP",
    logoUrl: "https://static.jup.ag/jup/icon.png",
    mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    decimals: 6,
  },
  TUNA: {
    name: "Tuna",
    symbol: "TUNA",
    logoUrl: "https://arweave.net/ItQ8aSdKqLDtw2AqwmVsWl7HKYgPnwklWlGcSxyiXjI",
    mint: "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump",
    decimals: 6,
  },
};

export function useTokenMetadata(tokenSymbol: string, tokenMint?: string): TokenMetadata | null {
  const [metadata, setMetadata] = useState<TokenMetadata | null>(null);

  useEffect(() => {
    const cacheKey = tokenMint || tokenSymbol;
    
    if (metadataCache.has(cacheKey)) {
      setMetadata(metadataCache.get(cacheKey)!);
      return;
    }
    
    const knownToken = KNOWN_TOKENS[tokenSymbol.toUpperCase()];
    if (knownToken) {
      metadataCache.set(cacheKey, knownToken);
      setMetadata(knownToken);
      return;
    }
    
    const fallback: TokenMetadata = {
      name: tokenSymbol,
      symbol: tokenSymbol,
    };
    metadataCache.set(cacheKey, fallback);
    setMetadata(fallback);
  }, [tokenSymbol, tokenMint]);

  return metadata;
}

export function getTokenLogoUrl(symbol: string): string | undefined {
  return KNOWN_TOKENS[symbol.toUpperCase()]?.logoUrl;
}
