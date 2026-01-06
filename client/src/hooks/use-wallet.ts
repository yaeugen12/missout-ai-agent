import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useCallback } from "react";

interface WalletState {
  address: string | null;
  avatar: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => void;
  disconnect: () => void;
  publicKey: string | null;
}

export function useWallet(): WalletState {
  const { 
    publicKey, 
    connected, 
    connecting,
    disconnect: solanaDisconnect 
  } = useSolanaWallet();
  const { setVisible } = useWalletModal();

  const connect = useCallback(() => {
    setVisible(true);
  }, [setVisible]);

  const disconnect = useCallback(() => {
    solanaDisconnect();
  }, [solanaDisconnect]);

  const address = publicKey?.toBase58() || null;
  const avatar = address 
    ? `https://api.dicebear.com/7.x/bottts/svg?seed=${address}` 
    : null;

  return {
    address,
    avatar,
    isConnected: connected,
    isConnecting: connecting,
    connect,
    disconnect,
    publicKey: address,
  };
}
