import React, { useMemo } from "react";
import type { ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";

import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";

import "@solana/wallet-adapter-react-ui/styles.css";

const RPC_ENDPOINT = import.meta.env.VITE_HELIUS_RPC_URL || import.meta.env.VITE_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const endpoint = RPC_ENDPOINT;

  const wallets = useMemo(
    () => [
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
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};
