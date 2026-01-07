import { useEffect, useMemo, useCallback, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, VersionedTransaction, Transaction } from "@solana/web3.js";

import {
  getMissoutClient,
  MissoutClient,
  createPool,
  joinPool,
  donateToPool,
  cancelPool,
  claimRefund,
  claimRent,
  claimRefundsBatch,
  claimRentsBatch,
  unlockPool,
  requestRandomness,
  selectWinner,
  payoutWinner,
  fetchPoolState,
  fetchParticipants,
  getPoolStatusString,
  type CreatePoolParams,
  type JoinPoolParams,
  type DonateParams,
  type PoolState,
  type ParticipantsState,
  type BatchClaimResult,
  type BatchClaimProgress,
} from "@/lib/solana-sdk";

export interface UseMissoutSDKResult {
  client: MissoutClient | null;
  connected: boolean;
  sdkReady: boolean;
  publicKey: PublicKey | null;
  signTransaction: (<T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>) | undefined;
  createPool: (params: CreatePoolParams) => Promise<{ poolId: string; tx: string }>;
  joinPool: (params: JoinPoolParams) => Promise<{ tx: string }>;
  donateToPool: (params: DonateParams) => Promise<{ tx: string }>;
  cancelPool: (poolId: string) => Promise<{ tx: string }>;
  claimRefund: (poolId: string) => Promise<{ tx: string }>;
  claimRent: (poolId: string, closeTarget: PublicKey) => Promise<{ tx: string }>;
  claimRefundsBatch: (poolIds: string[], onProgress?: (progress: BatchClaimProgress) => void) => Promise<BatchClaimResult[]>;
  claimRentsBatch: (poolIds: string[], closeTarget: PublicKey, onProgress?: (progress: BatchClaimProgress) => void) => Promise<BatchClaimResult[]>;
  unlockPool: (poolId: string) => Promise<{ tx: string }>;
  requestRandomness: (poolId: string, randomnessAccount: PublicKey) => Promise<{ tx: string }>;
  selectWinner: (poolId: string, randomnessAccount: PublicKey) => Promise<{ tx: string }>;
  payoutWinner: (poolId: string) => Promise<{ tx: string }>;
  fetchPoolState: (poolId: string) => Promise<PoolState | null>;
  fetchParticipants: (poolId: string) => Promise<ParticipantsState | null>;
  getPoolStatusString: (status: any) => string;
}

export function useMissoutSDK(): UseMissoutSDKResult {
  const wallet = useWallet();
  const [client, setClient] = useState<MissoutClient | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    try {
      const c = getMissoutClient();
      setClient(c);
    } catch (err) {
      console.warn("[useMissoutSDK] Failed to initialize SDK:", err);
    }
  }, []);

  useEffect(() => {
    if (client) {
      console.log("[useMissoutSDK] Calling setWallet with state:", {
        connected: wallet.connected,
        publicKey: wallet.publicKey?.toBase58(),
        hasSign: !!wallet.signTransaction,
        hasSend: !!wallet.sendTransaction
      });
      client.setWallet(wallet);
    }
  }, [client, wallet.connected, wallet.publicKey?.toBase58(), wallet.signTransaction, wallet.sendTransaction]);

  useEffect(() => {
    const ready = client !== null && wallet.connected && wallet.publicKey !== null;
    setSdkReady(ready);
  }, [client, wallet.connected, wallet.publicKey]);

  const wrappedCreatePool = useCallback(
    async (params: CreatePoolParams) => {
      if (!wallet.connected) {
        throw new Error("Wallet not connected");
      }
      return createPool(params);
    },
    [wallet.connected]
  );

  const wrappedJoinPool = useCallback(
    async (params: JoinPoolParams) => {
      if (!wallet.connected) {
        throw new Error("Wallet not connected");
      }
      return joinPool(params);
    },
    [wallet.connected]
  );

  const wrappedDonateToPool = useCallback(
    async (params: DonateParams) => {
      if (!wallet.connected) {
        throw new Error("Wallet not connected");
      }
      return donateToPool(params);
    },
    [wallet.connected]
  );

  const wrappedCancelPool = useCallback(
    async (poolId: string) => {
      if (!wallet.connected) {
        throw new Error("Wallet not connected");
      }
      return cancelPool(poolId);
    },
    [wallet.connected]
  );

  const wrappedClaimRefund = useCallback(
    async (poolId: string) => {
      if (!wallet.connected) {
        throw new Error("Wallet not connected");
      }
      return claimRefund(poolId);
    },
    [wallet.connected]
  );

  const wrappedClaimRent = useCallback(
    async (poolId: string, closeTarget: PublicKey) => {
      if (!wallet.connected) {
        throw new Error("Wallet not connected");
      }
      return claimRent(poolId, closeTarget);
    },
    [wallet.connected]
  );

  const wrappedClaimRefundsBatch = useCallback(
    async (poolIds: string[], onProgress?: (progress: BatchClaimProgress) => void) => {
      if (!wallet.connected) {
        throw new Error("Wallet not connected");
      }
      return claimRefundsBatch(poolIds, onProgress);
    },
    [wallet.connected]
  );

  const wrappedClaimRentsBatch = useCallback(
    async (poolIds: string[], closeTarget: PublicKey, onProgress?: (progress: BatchClaimProgress) => void) => {
      if (!wallet.connected) {
        throw new Error("Wallet not connected");
      }
      return claimRentsBatch(poolIds, closeTarget, onProgress);
    },
    [wallet.connected]
  );

  const wrappedUnlockPool = useCallback(
    async (poolId: string) => {
      if (!wallet.connected) {
        throw new Error("Wallet not connected");
      }
      return unlockPool(poolId);
    },
    [wallet.connected]
  );

  const wrappedRequestRandomness = useCallback(
    async (poolId: string, randomnessAccount: PublicKey) => {
      if (!wallet.connected) {
        throw new Error("Wallet not connected");
      }
      return requestRandomness(poolId, randomnessAccount);
    },
    [wallet.connected]
  );

  const wrappedSelectWinner = useCallback(
    async (poolId: string, randomnessAccount: PublicKey) => {
      if (!wallet.connected) {
        throw new Error("Wallet not connected");
      }
      return selectWinner(poolId, randomnessAccount);
    },
    [wallet.connected]
  );

  const wrappedPayoutWinner = useCallback(
    async (poolId: string) => {
      if (!wallet.connected) {
        throw new Error("Wallet not connected");
      }
      return payoutWinner(poolId);
    },
    [wallet.connected]
  );

  return {
    client,
    connected: wallet.connected,
    sdkReady,
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction,
    createPool: wrappedCreatePool,
    joinPool: wrappedJoinPool,
    donateToPool: wrappedDonateToPool,
    cancelPool: wrappedCancelPool,
    claimRefund: wrappedClaimRefund,
    claimRent: wrappedClaimRent,
    claimRefundsBatch: wrappedClaimRefundsBatch,
    claimRentsBatch: wrappedClaimRentsBatch,
    unlockPool: wrappedUnlockPool,
    requestRandomness: wrappedRequestRandomness,
    selectWinner: wrappedSelectWinner,
    payoutWinner: wrappedPayoutWinner,
    fetchPoolState,
    fetchParticipants,
    getPoolStatusString,
  };
}

export default useMissoutSDK;
