import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
  logoUrl?: string;
}

interface WalletBalances {
  solBalance: number | null;
  tokens: TokenBalance[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useWalletBalances(): WalletBalances {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!publicKey || !connected) {
      setSolBalance(null);
      setTokens([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Try to get balance with retry
      let balance = 0;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          balance = await connection.getBalance(publicKey, 'confirmed');
          break;
        } catch (err) {
          if (attempt === 2) throw err;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      setSolBalance(balance / LAMPORTS_PER_SOL);

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      const tokenBalances: TokenBalance[] = [];
      
      // Fetch devnet token metadata if on devnet
      const isDevnet = import.meta.env.VITE_NETWORK === "devnet" || 
                       window.location.hostname.includes("replit.dev") ||
                       import.meta.env.VITE_SOLANA_CLUSTER === "devnet";

      for (const account of tokenAccounts.value) {
        const parsedInfo = account.account.data.parsed.info;
        const mintAddress = parsedInfo.mint;
        const tokenAmount = parsedInfo.tokenAmount;
        
        if (tokenAmount.uiAmount === 0) continue;

        let symbol = mintAddress.slice(0, 4) + "..." + mintAddress.slice(-4);
        let name = "Unknown Token";
        let logoUrl: string | undefined;

        // On devnet, try a few hardcoded known mints or fallback to generic symbol for testing
        if (isDevnet) {
          // Hardcoded metadata for the user's specific token if Helius fails
          if (mintAddress === "HNcz9fndVXBogLjU55uyvbz79P5qWxaBZVKk7iRSy7jV") {
            symbol = "HNCZ9F";
            name = "HNCZ9F Token";
          }
        }

        try {
          const heliusRpcUrl = import.meta.env.VITE_HELIUS_RPC_URL;
          if (heliusRpcUrl && !heliusRpcUrl.includes("api-key=YOUR_API_KEY")) {
            const response = await fetch(heliusRpcUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: mintAddress,
                method: "getAsset",
                params: { id: mintAddress },
              }),
            });
            const data = await response.json();
            if (data.result?.content?.metadata) {
              symbol = data.result.content.metadata.symbol || symbol;
              name = data.result.content.metadata.name || name;
            }
            if (data.result?.content?.links?.image) {
              logoUrl = data.result.content.links.image;
            }
          }
        } catch {
          console.log(`[useWalletBalances] Failed to fetch metadata for ${mintAddress}`);
        }

        tokenBalances.push({
          mint: mintAddress,
          symbol,
          name,
          balance: tokenAmount.uiAmount,
          decimals: tokenAmount.decimals,
          logoUrl,
        });
      }

      tokenBalances.sort((a, b) => b.balance - a.balance);
      setTokens(tokenBalances);
    } catch (err: any) {
      const errorMsg = err?.message || err?.toString?.() || JSON.stringify(err) || "Unknown error";
      console.error("[useWalletBalances] Error fetching balances:", errorMsg, err);
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [connection, publicKey, connected]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return {
    solBalance,
    tokens,
    isLoading,
    error,
    refresh: fetchBalances,
  };
}
