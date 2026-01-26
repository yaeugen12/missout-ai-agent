// BUILD_ID: v10-cancel-pool-not-full
const BUILD_ID = "v10-cancel-pool-not-full";

import { useParams } from "wouter";
import { usePool } from "@/hooks/use-pools";
import { useWallet } from "@/hooks/use-wallet";
import { Navbar } from "@/components/Navbar";
import { BlackHoleExperience } from "@/components/BlackHoleExperience";
import { PoolChat } from "@/components/PoolChat";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  XCircle,
  Ban,
  Clock,
  Coins,
  Gift,
  AlertTriangle,
  Heart,
  Trophy,
  Users,
  RefreshCw,
  Zap,
  Loader2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQueries } from "@tanstack/react-query";
import { api } from "@/types/shared";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { useMissoutSDK } from "@/hooks/useMissoutSDK";
import { MissoutClient, getMissoutClient } from "@/lib/solana-sdk/client";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getSolscanTxUrl } from "@/hooks/use-sdk-transaction";
import { showTransactionToast } from "@/lib/transaction-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { apiFetch } from "@/lib/api";
import { socket } from "@/lib/socket";
import { VolatilityWaveform } from "@/components/VolatilityWaveform";

function ParticipantRow({ walletAddress }: { walletAddress: string }) {
  const { data: profile, isLoading } = useQueries({
    queries: [{
      queryKey: [api.profiles.get.path.replace(":wallet", walletAddress)],
      queryFn: () => apiFetch(api.profiles.get.path.replace(":wallet", walletAddress)).then(res => res.json()),
      staleTime: 60000,
    }]
  })[0];

  const displayName = profile?.nickname || `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
  const avatarUrl = profile?.avatarUrl || profile?.displayAvatar;

  return (
    <div className="flex items-center gap-3 p-2 rounded-md bg-white/5 border border-white/5 hover:border-primary/30 transition-all group">
      <Avatar className="h-8 w-8 border border-primary/20 group-hover:border-primary/50 transition-colors">
        <AvatarImage src={avatarUrl} className="object-cover" />
        <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
          {walletAddress.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium truncate text-white group-hover:text-primary transition-colors">
          {displayName}
        </span>
        <span className="text-[10px] text-muted-foreground truncate font-mono">
          {walletAddress}
        </span>
      </div>
      {isLoading && <Loader2 className="w-3 h-3 animate-spin ml-auto text-primary/50" />}
    </div>
  );
}

export default function PoolDetails() {
  const { id } = useParams();
  const poolId = parseInt(id || "0");
  const { data: pool, isLoading, error } = usePool(poolId);
  const { isConnected, address, connect } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { joinPool, donateToPool, cancelPool, claimRefund, connected: sdkConnected } = useMissoutSDK();

  const [isJoining, setIsJoining] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isClaimingRefund, setIsClaimingRefund] = useState(false);
  const [isDonating, setIsDonating] = useState(false);
  const [donateModalOpen, setDonateModalOpen] = useState(false);
  const [donateAmount, setDonateAmount] = useState("");

  const poolAddress = pool?.poolAddress;
  const isCreator = pool?.creatorWallet === address;
  const hasJoined = false; // Backend validates double-join prevention; UI always allows attempt
  const canCancel = Boolean(
    isCreator &&
    pool?.status === 'open' &&
    (pool?.participantsCount ?? 0) < (pool?.maxParticipants ?? 0) &&
    !(pool as any)?.paused // Check paused state if it exists
  );
  const canClaimRefund = hasJoined && pool?.status === 'cancelled';

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [api.pools.list.path] });
    queryClient.invalidateQueries({ queryKey: [api.pools.get.path, poolId] });
  }, [queryClient, poolId]);

  // Auto-refresh pool data when waiting for winner payout
  useEffect(() => {
    if (!pool || (pool.status !== 'winnerSelected' && pool.status !== 'randomness' && pool.status !== 'unlocking')) {
      return;
    }


    // Poll every 3 seconds while waiting for state transitions
    const interval = setInterval(() => {
      invalidateQueries();
    }, 3000);

    return () => clearInterval(interval);
  }, [pool?.id, pool?.status, invalidateQueries]);

  // Listen for real-time price updates via WebSocket
  useEffect(() => {
    if (!poolId) return;

    const handlePriceUpdate = (data: {
      poolId: number;
      currentPriceUsd: number;
      initialPriceUsd: number;
      changePercent: number;
    }) => {
      // Only update if it's for our pool
      if (data.poolId === poolId) {
        // Invalidate queries to refetch pool data with new price
        invalidateQueries();
      }
    };

    socket.on('price-update', handlePriceUpdate);

    return () => {
      socket.off('price-update', handlePriceUpdate);
    };
  }, [poolId, invalidateQueries]);

  const handleJoin = useCallback(async () => {

    if (!isConnected || !address) {
      connect();
      return;
    }

    if (!poolAddress || !pool) {
      toast({ variant: "destructive", title: "Error", description: "Pool not ready" });
      return;
    }

    setIsJoining(true);
    try {

      const result = await joinPool({
        poolId: poolAddress,
        amount: pool.entryAmount.toString(),
      });

      // Proof of success: SDK already throws if tx.meta.err exists
      if (!result?.tx) {
        throw new Error("No transaction signature returned from wallet");
      }

      // 3. Notify backend
      await apiFetch(`/api/pools/${pool.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          txHash: result.tx
        }),
        credentials: 'include'
      });

      // 4. Fetch balance diff for UI display
      let balanceMsg = "";
      try {
        const sdk = getMissoutClient();
        const txInfo = await sdk.getConnection().getTransaction(result.tx, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0
        });
        if (txInfo?.meta) {
          const userAta = getAssociatedTokenAddressSync(
            new PublicKey(pool.tokenMint!),
            new PublicKey(address),
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          ).toBase58();

          const pre = txInfo.meta.preTokenBalances?.find(b => b.owner === address || b.accountIndex === txInfo.transaction.message.staticAccountKeys.findIndex(k => k.toBase58() === userAta));
          const post = txInfo.meta.postTokenBalances?.find(b => b.owner === address || b.accountIndex === txInfo.transaction.message.staticAccountKeys.findIndex(k => k.toBase58() === userAta));

          if (pre && post) {
            const diff = (Number(pre.uiTokenAmount.amount) - Number(post.uiTokenAmount.amount)) / Math.pow(10, pre.uiTokenAmount.decimals);
            if (diff > 0) {
              balanceMsg = ` (${diff.toFixed(2)} ${pool.tokenSymbol} removed from wallet)`;
            }
          }
        }
      } catch (e) {
        console.warn("Balance diff error", e);
      }

      showTransactionToast({
        type: "success",
        title: "Successfully Pulled In!",
        description: `You have joined the black hole.${balanceMsg}`,
        txHash: result.tx
      });

      // Immediately invalidate queries to refresh pool data
      // The 1s polling interval will pick up changes quickly
      invalidateQueries();
    } catch (err: any) {
      console.error("=== JOIN_ERROR ===", err);
      showTransactionToast({
        type: "error",
        title: "Pull Failed",
        description: err.message || "Could not join the black hole."
      });
    } finally {
      setIsJoining(false);
    }
  }, [isConnected, address, poolAddress, pool, poolId, joinPool, toast, connect, invalidateQueries]);

  const handleDonate = useCallback(async () => {

    if (!isConnected || !address) {
      connect();
      return;
    }

    if (!poolAddress || !pool) {
      toast({ variant: "destructive", title: "Error", description: "Pool not ready" });
      return;
    }

    const amount = parseFloat(donateAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "Invalid Amount", description: "Please enter a valid amount" });
      return;
    }

    setIsDonating(true);
    try {

      const result = await donateToPool({
        poolId: poolAddress,
        amount: amount.toString(),
      });


      // POST to backend with txHash
      await apiFetch(`/api/pools/${poolId}/donate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          amount: amount,
          txHash: result.tx,
        }),
        credentials: 'include'
      });

      showTransactionToast({
        type: "success",
        title: "Fed the Void",
        description: `Donated ${amount} ${pool.tokenSymbol}!`,
        txHash: result.tx
      });

      setDonateModalOpen(false);
      setDonateAmount("");
      invalidateQueries();
    } catch (err) {
      console.error("=== DONATE_ERROR ===", err);
      showTransactionToast({
        type: "error",
        title: "Donation Failed",
        description: err instanceof Error ? err.message : "Transaction failed",
      });
    } finally {
      setIsDonating(false);
    }
  }, [isConnected, address, poolAddress, pool, poolId, donateAmount, donateToPool, toast, connect, invalidateQueries]);

  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  
  const handleCancel = useCallback(async () => {
    if (!poolAddress) {
      toast({ variant: "destructive", title: "Error", description: "Pool address not available" });
      return;
    }

    // Final safety check
    if (!canCancel) {
      toast({
        variant: "destructive",
        title: "Cannot Cancel",
        description: "Pool can only be cancelled while open and not full"
      });
      return;
    }

    setIsCancelling(true);
    try {
      const result = await cancelPool(poolAddress);

      if (!result?.tx) {
        throw new Error("No transaction signature returned from cancel");
      }


      // Notify backend about cancellation (optional but good for tracking)
      try {
        await apiFetch(`/api/pools/${poolId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: address,
            txHash: result.tx,
          }),
          credentials: 'include'
        });
      } catch (err) {
        console.warn("Backend notification failed", err);
      }

      const explorerUrl = getSolscanTxUrl(result.tx);

      showTransactionToast({
        type: "success",
        title: "Pool Cancelled",
        description: `Black hole collapsed.`,
        txHash: result.tx
      });

      // Immediately invalidate queries to refresh pool data
      invalidateQueries();
    } catch (err: any) {
      console.error("=== CANCEL_ERROR ===", err);

      let errorMessage = "Transaction failed";
      if (err.message?.includes("User rejected") || err.message?.includes("rejected")) {
        errorMessage = "Transaction cancelled in wallet";
      } else if (err.message?.includes("Account does not exist")) {
        errorMessage = "Pool not found on-chain. It may still be confirming. Please wait a moment and try refreshing the page.";
      } else if (err.message) {
        errorMessage = err.message;
      }

      showTransactionToast({
        type: "error",
        title: "Cancel Failed",
        description: errorMessage,
      });
    } finally {
      setIsCancelling(false);
    }
  }, [poolAddress, canCancel, cancelPool, toast, invalidateQueries]);

  const handleClaimRefund = useCallback(async () => {
    if (!poolAddress) return;

    setIsClaimingRefund(true);
    try {
      const result = await claimRefund(poolAddress);

      // Notify backend about refund
      try {
        await apiFetch(`/api/pools/${poolId}/refund`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: address,
            txHash: result.tx,
          }),
          credentials: 'include'
        });
      } catch (err) {
        console.warn("Backend notification failed", err);
      }

      showTransactionToast({
        type: "success",
        title: "Refund Claimed",
        description: `Tokens returned.`,
        txHash: result.tx
      });
      invalidateQueries();
    } catch (err) {
      showTransactionToast({
        type: "error",
        title: "Refund Failed",
        description: err instanceof Error ? err.message : "Transaction failed",
      });
    } finally {
      setIsClaimingRefund(false);
    }
  }, [poolAddress, claimRefund, toast, invalidateQueries]);

  if (isLoading) return <div className="min-h-screen bg-black flex items-center justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;
  if (error || !pool) return <div className="min-h-screen bg-black flex items-center justify-center text-red-500">Error loading pool</div>;

  // Find winner's profile data from participants list (case-insensitive)
  const participants = (pool as any).participants || [];
  const winnerParticipant = pool.winnerWallet
    ? participants.find((p: any) => p.walletAddress.toLowerCase() === pool.winnerWallet.toLowerCase())
    : null;
  const winnerDisplayName = winnerParticipant?.displayName;
  const winnerAvatar = winnerParticipant?.displayAvatar;

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden relative">
      {/* Hero Section with Black Hole */}
      <div className="relative h-[100vh] flex flex-col items-center justify-center pt-28 overflow-hidden bg-black">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,240,255,0.08)_0%,transparent_80%)]" />

        {/* Black Hole Visual with Orbiting Avatars */}
        <div className="relative z-10 w-full flex-1 flex items-center justify-center mt-16">
          <BlackHoleExperience
            status={pool.status}
            participants={participants}
            maxParticipants={pool.maxParticipants}
            lockEndTime={pool.lockStartTime ? new Date((pool.lockStartTime * 1000) + (pool.lockDuration * 60 * 1000)) : null}
            winnerWallet={pool.winnerWallet}
            winnerDisplayName={winnerDisplayName}
            winnerAvatar={winnerAvatar}
            prizeAmount={pool.totalPot || 0}
            tokenSymbol={pool.tokenSymbol}
            priceUsd={pool.currentPriceUsd}
            payoutTxHash={(pool as any).payoutTxHash}
          />

          {/* ✅ Volatility & Singularity Mass – Right HUD */}
          <div className="absolute right-10 top-1/2 -translate-y-1/2 z-40 hidden lg:block">
            <div className="flex flex-col gap-4">
              {/* Volatility Pulse */}
              <VolatilityWaveform 
                initialPrice={pool.initialPriceUsd ?? null}
                currentPrice={pool.currentPriceUsd ?? null}
                className="min-w-[220px]"
              />
              
              {/* Singularity Mass */}
              <div className="bg-zinc-900/60 p-6 rounded-2xl backdrop-blur-xl shadow-2xl min-w-[220px]">
                <div className="text-[10px] font-tech text-muted-foreground uppercase tracking-[0.4em] mb-2 opacity-60">
                  Singularity Mass
                </div>
                <div className="text-5xl font-mono font-black text-neon-cyan leading-none tracking-tighter">
                  {(pool.totalPot || 0).toFixed(2)}
                </div>
                <div className="text-xs font-mono font-black text-primary mt-3 uppercase tracking-[0.3em] opacity-80">
                  {pool.tokenSymbol}
                </div>

                {/* USD Value (Mock Mainnet Mode) */}
                {pool.currentPriceUsd && pool.currentPriceUsd > 0 && (
                  <div className="mt-4 pt-3 border-t border-primary/10">
                    <div className="text-2xl font-mono font-bold text-green-400">
                      ${((pool.totalPot || 0) * pool.currentPriceUsd).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </div>
                    <div className="text-[9px] font-tech text-muted-foreground uppercase tracking-widest mt-1 opacity-60">
                      USD Value
                    </div>
                  </div>
                )}

                {/* Distribution Breakdown */}
                <div className="mt-4 pt-3 border-t border-primary/10 space-y-2">
                  <div className="text-[9px] font-tech text-muted-foreground uppercase tracking-[0.3em] mb-3 opacity-60">
                    Distribution
                  </div>

                  {/* Winner 90% */}
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-tech text-amber-100 opacity-80">Winner 90%</span>
                    <div className="text-right">
                      <div className="font-mono font-bold text-amber-100">
                        {((pool.totalPot || 0) * 0.90).toFixed(2)}
                      </div>
                      {pool.currentPriceUsd && pool.currentPriceUsd > 0 && (
                        <div className="text-[10px] text-green-400 opacity-70">
                          ${(((pool.totalPot || 0) * 0.90) * pool.currentPriceUsd).toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dev 5% */}
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-tech text-blue-300 opacity-70">Dev 5%</span>
                    <div className="text-right">
                      <div className="font-mono text-blue-300 opacity-80">
                        {((pool.totalPot || 0) * 0.05).toFixed(2)}
                      </div>
                      {pool.currentPriceUsd && pool.currentPriceUsd > 0 && (
                        <div className="text-[10px] text-green-400 opacity-60">
                          ${(((pool.totalPot || 0) * 0.05) * pool.currentPriceUsd).toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Burn 3.5% */}
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-tech text-orange-400 opacity-70">Burn 3.5%</span>
                    <div className="text-right">
                      <div className="font-mono text-orange-400 opacity-80">
                        {((pool.totalPot || 0) * 0.035).toFixed(2)}
                      </div>
                      {pool.currentPriceUsd && pool.currentPriceUsd > 0 && (
                        <div className="text-[10px] text-green-400 opacity-60">
                          ${(((pool.totalPot || 0) * 0.035) * pool.currentPriceUsd).toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Treasury 1.5% */}
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-tech text-primary opacity-70">Treasury 1.5%</span>
                    <div className="text-right">
                      <div className="font-mono text-primary opacity-80">
                        {((pool.totalPot || 0) * 0.015).toFixed(2)}
                      </div>
                      {pool.currentPriceUsd && pool.currentPriceUsd > 0 && (
                        <div className="text-[10px] text-green-400 opacity-60">
                          ${(((pool.totalPot || 0) * 0.015) * pool.currentPriceUsd).toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content Overlay - below the visual (only badges now) */}
        <div className="w-full container mx-auto px-4 z-20 pb-12 mt-8">
          <div className="flex flex-col md:flex-row justify-between items-center md:items-end gap-8 text-center md:text-left">
            <div className="space-y-4">
              <div className="flex flex-wrap justify-center md:justify-start items-center gap-4 text-xs font-tech text-muted-foreground uppercase tracking-[0.2em]">
                <span className="flex items-center gap-2 bg-white/5 px-5 py-2.5 rounded-full border border-white/10 backdrop-blur-md">
                  <Clock className="w-4 h-4 text-primary" /> {pool.lockDuration}m Horizon
                </span>
                <span className="flex items-center gap-2 bg-white/5 px-5 py-2.5 rounded-full border border-white/10 backdrop-blur-md">
                  <Coins className="w-4 h-4 text-primary" /> {pool.entryAmount} {pool.tokenSymbol}
                </span>
              </div>
            </div>

            {/* ⛔ removed old Singularity Mass block from here */}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="container mx-auto px-4 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left Col: Actions & Status */}
          <div className="lg:col-span-2 space-y-6">

            {/* Action Card */}
            <div className="bg-white/5 border border-white/10 p-6 rounded-lg backdrop-blur-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-display font-bold">STATUS: <span className={clsx(
                  pool.status === 'open' ? 'text-primary' : 'text-yellow-500'
                )}>{pool.status === 'locked' ? 'EVENT HORIZON' : pool.status.toUpperCase()}</span></h3>
                <div className="text-sm text-muted-foreground font-mono">
                  {pool.participantsCount} / {pool.maxParticipants} entities pulled
                </div>
              </div>

              <Progress value={((pool.participantsCount ?? 0) / pool.maxParticipants) * 100} className="h-2 mb-8 bg-white/10" />

              {pool.status === 'open' ? (
                hasJoined ? (
                  <Button disabled className="w-full h-14 text-lg font-bold bg-white/10 text-muted-foreground" data-testid="button-already-joined">
                    ALREADY JOINED
                  </Button>
                ) : (
                  <Button
                    onClick={handleJoin}
                    disabled={isJoining || !poolAddress}
                    className="w-full h-14 text-lg font-bold bg-primary text-black hover:bg-white hover:text-primary transition-all uppercase tracking-widest"
                    data-testid="button-join-pool"
                  >
                    {isJoining ? <Loader2 className="animate-spin" /> : (
                      !isConnected ? "Connect Wallet to Join" : `Get Pulled In (${pool.entryAmount})`
                    )}
                  </Button>
                )
              ) : pool.status === 'cancelled' ? (
                canClaimRefund ? (
                  <Button
                    onClick={handleClaimRefund}
                    disabled={isClaimingRefund || !sdkConnected}
                    className="w-full h-14 text-lg font-bold bg-green-600 text-white hover:bg-green-500 transition-all uppercase tracking-widest"
                    data-testid="button-claim-refund"
                  >
                    {isClaimingRefund ? <Loader2 className="animate-spin" /> : (
                      <>
                        <Gift className="w-5 h-5 mr-2" />
                        Claim Refund
                      </>
                    )}
                  </Button>
                ) : (
                  <Button disabled className="w-full h-14 text-lg font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                    <XCircle className="w-5 h-5 mr-2" />
                    POOL CANCELLED
                  </Button>
                )
              ) : (
                <Button disabled className="w-full h-14 text-lg font-bold bg-white/5 text-muted-foreground border border-white/10">
                  EVENT HORIZON REACHED
                </Button>
              )}

              {isCreator && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  {canCancel ? (
                    <>
                      <Button
                        variant="destructive"
                        onClick={() => setIsCancelDialogOpen(true)}
                        disabled={isCancelling || !sdkConnected}
                        className="w-full h-12 gap-2 text-sm font-black uppercase tracking-[0.2em] bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 hover:border-rose-500/40 transition-all duration-300"
                        data-testid="button-cancel-pool"
                      >
                        {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                        Collapse Singularity
                      </Button>

                      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
                        <AlertDialogContent className="bg-[#050505] border border-rose-500/30 shadow-[0_0_50px_rgba(244,63,94,0.15)] backdrop-blur-3xl max-w-md">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-xl font-black tracking-tighter text-rose-500 flex items-center gap-3">
                              <AlertTriangle className="w-6 h-6 animate-pulse" />
                              CRITICAL PROTOCOL
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-300 space-y-5 pt-4">
                              <div className="space-y-2">
                                <p className="font-bold text-sm leading-relaxed uppercase tracking-wide">
                                  You are about to initiate <span className="text-rose-400 underline decoration-rose-500/50">Singularity Collapse</span>.
                                </p>
                                <p className="text-[11px] text-slate-400 leading-normal">
                                  To prevent temporal spam and void instability, a protocol fee is required for all manual cancellations.
                                </p>
                              </div>
                              
                              <div className="bg-rose-500/5 border border-rose-500/10 p-4 rounded-lg space-y-3 relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-r from-rose-500/0 via-rose-500/5 to-rose-500/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black tracking-widest uppercase text-slate-400">Recovery Amount</span>
                                  <span className="text-sm font-mono font-bold text-emerald-400">95%</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black tracking-widest uppercase text-rose-400">Anti-Spam Burn</span>
                                  <span className="text-sm font-mono font-bold text-rose-500">-5%</span>
                                </div>
                              </div>

                              <p className="text-[10px] text-slate-500 italic leading-tight">
                                * The 5% anti-spam fee is permanently incinerated and cannot be recovered under any circumstances.
                              </p>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="mt-6 flex flex-col sm:flex-row gap-3">
                            <AlertDialogCancel className="flex-1 bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white uppercase tracking-[0.2em] text-[10px] font-black h-12 transition-all">
                              Abort
                            </AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => {
                                setIsCancelDialogOpen(false);
                                handleCancel();
                              }}
                              className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-black uppercase tracking-[0.2em] text-[10px] border-none shadow-[0_0_20px_rgba(225,29,72,0.4)] h-12 transition-all active:scale-95"
                            >
                              Confirm Collapse
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      disabled
                      className="w-full gap-2 border-white/10 text-muted-foreground cursor-not-allowed opacity-50"
                      title="Only available while pool is Open and not full"
                    >
                      <Ban className="w-4 h-4" />
                      Cancel Pool
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    {canCancel
                      ? "Cancel this pool (participants will be refunded)"
                      : pool?.status !== 'open'
                        ? "Pool cannot be cancelled (not in Open status)"
                        : (pool?.participantsCount ?? 0) >= (pool?.maxParticipants ?? 0)
                          ? "Pool cannot be cancelled (full)"
                          : "Only available while pool is Open and not full"
                    }
                  </p>
                </div>
              )}

              {!isConnected && pool.status === 'open' && !hasJoined && (
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                  <p className="text-xs text-yellow-400 text-center">
                    Connect your wallet to join this Black Hole
                  </p>
                </div>
              )}

              {/* Donate Button - available when pool is not ended/cancelled */}
              {pool.status !== 'ended' && pool.status !== 'cancelled' && poolAddress && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDonateModalOpen(true);
                    }}
                    disabled={!sdkConnected || !isConnected}
                    className="w-full gap-2 border-primary/50 text-primary hover:bg-primary/10"
                    data-testid="button-open-donate-modal"
                  >
                    <Heart className="w-4 h-4" />
                    Feed the Void (Donate)
                  </Button>
                </div>
              )}

            </div>

          </div>

          {/* Right Col: Participants List */}
          <div className="bg-white/5 border border-white/10 rounded-lg backdrop-blur-sm flex flex-col h-[500px]">
            <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
              <h3 className="font-tech font-bold uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> Pulled Entities
              </h3>
              <span className="text-xs bg-black px-2 py-1 rounded text-muted-foreground font-mono">
                LIVE
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {participants.length > 0 ? (
                participants.map((p: any) => (
                  <ParticipantRow key={p.walletAddress} walletAddress={p.walletAddress} />
                ))
              ) : (
                <div className="text-center text-muted-foreground py-10 text-sm">
                  No entities pulled yet...
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Donate Modal */}
      <Dialog open={donateModalOpen} onOpenChange={setDonateModalOpen}>
        <DialogContent className="bg-zinc-900 border-primary/30 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-display font-bold text-primary">
              Feed the Void
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Donate {pool?.tokenSymbol} tokens to increase the pot. Donations are non-refundable.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-tech uppercase text-muted-foreground">
                Amount ({pool?.tokenSymbol})
              </label>
              <Input
                type="number"
                step="0.0001"
                min="0"
                placeholder="Enter amount"
                value={donateAmount}
                onChange={(e) => {
                  setDonateAmount(e.target.value);
                }}
                className="bg-black/50 border-white/10 text-white font-mono"
                data-testid="input-donate-amount"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDonateModalOpen(false)}
              className="border-white/20"
              data-testid="button-cancel-donate"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDonate}
              disabled={isDonating || !donateAmount || parseFloat(donateAmount) <= 0}
              className="bg-primary text-black hover:bg-primary/90"
              data-testid="button-confirm-donate"
            >
              {isDonating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Heart className="w-4 h-4 mr-2" />}
              Donate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pool Chat */}
      <PoolChat poolId={pool.id} poolStatus={pool.status} />
    </div>
  );
}
