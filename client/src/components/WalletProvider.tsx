import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";

import "@solana/wallet-adapter-react-ui/styles.css";

// STRICT DEVNET - Helius RPC only
const HELIUS_DEVNET_RPC =
  "https://devnet.helius-rpc.com/?api-key=3c5e3da7-9230-4336-9060-3b2aae17eb07";

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const endpoint = HELIUS_DEVNET_RPC;

  // Use a stable identity for wallets array
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
    ],
    []
  );

  const config = useMemo(
    () => ({
      commitment: "finalized" as const,
      confirmTransactionInitialTimeout: 60000,
    }),
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint} config={config}>
      <SolanaWalletProvider
        wallets={wallets}
        autoConnect={true}
        localStorageKey="missout-wallet-key"
      >
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
