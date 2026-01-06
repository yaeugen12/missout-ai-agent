// BUILD_ID: v10-cancel-pool-not-full
const BUILD_ID = "v10-cancel-pool-not-full";
console.log("=== POOL_DETAILS_LOADED ===", BUILD_ID);

import { useParams } from "wouter";
import { usePool } from "@/hooks/use-pools";
import { useWallet } from "@/hooks/use-wallet";
import { Navbar } from "@/components/Navbar";
import { BlackHoleCore } from "@/components/BlackHoleCore";
import { RouletteReveal } from "@/components/RouletteReveal";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Trophy, Clock, Users, Coins, AlertTriangle, Ban, RefreshCw, Zap, Gift, XCircle, Heart } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { useMissoutSDK } from "@/hooks/useMissoutSDK";
import { MissoutClient, getMissoutClient } from "@/lib/solana-sdk/client";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getSolscanTxUrl } from "@/hooks/use-sdk-transaction";
import { DevnetReadiness } from "@/components/DevnetReadiness";

export default function PoolDetails() {
  const { id } = useParams();
  const poolId = parseInt(id || "0");
  const { data: pool, isLoading, error } = usePool(poolId);
  const { isConnected, address, connect } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { joinPool, donateToPool, cancelPool, claimRefund, connected: sdkConnected } = useMissoutSDK();
  
  const [showRoulette, setShowRoulette] = useState(false);
  const [winnerRevealed, setWinnerRevealed] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isClaimingRefund, setIsClaimingRefund] = useState(false);
  const [isDonating, setIsDonating] = useState(false);
  const [donateModalOpen, setDonateModalOpen] = useState(false);
  const [donateAmount, setDonateAmount] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);

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
  
  useEffect(() => {
    if (pool?.status === 'winnerSelected' && !winnerRevealed) {
      setShowRoulette(true);
    }
  }, [pool?.status, winnerRevealed]);

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [api.pools.list.path] });
    queryClient.invalidateQueries({ queryKey: [api.pools.get.path, poolId] });
  }, [queryClient, poolId]);

  // Countdown timer - only starts when pool is locked (lockStartTime is set)
  useEffect(() => {
    if (!pool?.lockStartTime || pool.status !== 'locked') {
      setCountdown(null);
      return;
    }

    const lockEndTime = pool.lockStartTime + (pool.lockDuration * 60); // lockDuration is in minutes

    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = lockEndTime - now;
      setCountdown(remaining > 0 ? remaining : 0);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [pool?.lockStartTime, pool?.lockDuration, pool?.status]);

  // Auto-refresh pool data when waiting for winner payout
  useEffect(() => {
    if (!pool || (pool.status !== 'winnerSelected' && pool.status !== 'randomness' && pool.status !== 'unlocking')) {
      return;
    }

    console.log(`[AUTO-REFRESH] Pool ${pool.id} status=${pool.status}, polling for updates...`);

    // Poll every 3 seconds while waiting for state transitions
    const interval = setInterval(() => {
      console.log(`[AUTO-REFRESH] Refreshing pool ${pool.id}`);
      invalidateQueries();
    }, 3000);

    return () => clearInterval(interval);
  }, [pool?.id, pool?.status, invalidateQueries]);

  const handleJoin = useCallback(async () => {
    console.log("=== JOIN_CLICK ===", BUILD_ID);
    
    if (!isConnected || !address) {
      console.log("JOIN: Wallet not connected, prompting connect");
      connect();
      return;
    }
    
    if (!poolAddress || !pool) {
      console.log("JOIN: Error - Pool address or pool data missing", { poolAddress, hasPool: !!pool });
      toast({ variant: "destructive", title: "Error", description: "Pool not ready" });
      return;
    }

    setIsJoining(true);
    try {
      console.log("=== SDK_JOIN_ENTER ===");
      console.log("JOIN params:", { poolId: poolAddress, amount: pool.entryAmount });
      
      const result = await joinPool({
        poolId: poolAddress,
        amount: pool.entryAmount.toString(),
      });
      
      // Proof of success: SDK already throws if tx.meta.err exists
      console.log("=== JOIN_TX_CONFIRMED ===", result?.tx);
      if (!result?.tx) {
        throw new Error("No transaction signature returned from wallet");
      }
      console.log("Join tx:", getSolscanTxUrl(result.tx));
      
      // 3. Notify backend
      await apiRequest('POST', `/api/pools/${pool.id}/join`, {
        walletAddress: address,
        txHash: result.tx
      });
      console.log("=== BACKEND_JOIN_SUCCESS ===");

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
      
      toast({
        title: "Successfully Pulled In!",
        description: `You have joined the black hole.${balanceMsg}`,
      });
      
      // Wait a moment for DB/Indexer to catch up before refresh
      setTimeout(() => {
        invalidateQueries();
      }, 1000);
    } catch (err: any) {
      console.error("=== JOIN_ERROR ===", err);
      // Extract logs if available in error message
      let detailedError = err.message || "Could not join the black hole.";
      if (err.message?.includes("Logs:")) {
        const parts = err.message.split("Logs:");
        detailedError = parts[0] + "\n\nProgram Logs:\n" + parts[1].replace(/ \| /g, "\n");
      }
      
      toast({
        variant: "destructive",
        title: "Pull Failed",
        description: <pre className="mt-2 w-full overflow-x-auto font-mono text-[10px] leading-tight bg-black/50 p-2 rounded border border-white/10 whitespace-pre-wrap">{detailedError}</pre>,
      });
    } finally {
      setIsJoining(false);
    }
  }, [isConnected, address, poolAddress, pool, poolId, joinPool, toast, connect, invalidateQueries]);

  const handleDonate = useCallback(async () => {
    console.log("=== DONATE_CONFIRM_CLICK ===", BUILD_ID);
    
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
      console.log("=== SDK_DONATE_ENTER ===");
      console.log("DONATE params:", { poolId: poolAddress, amount });
      
      const result = await donateToPool({
        poolId: poolAddress,
        amount: amount.toString(),
      });
      
      console.log("=== DONATE_TX_CONFIRMED ===", result.tx);
      console.log("Donate tx:", getSolscanTxUrl(result.tx));
      
      // POST to backend with txHash
      console.log("=== POSTING_DONATE_TO_BACKEND ===");
      await apiRequest("POST", `/api/pools/${poolId}/donate`, {
        walletAddress: address,
        amount: amount,
        txHash: result.tx,
      });
      console.log("=== BACKEND_DONATE_SUCCESS ===");
      
      toast({
        title: "Fed the Void",
        description: `Donated ${amount} ${pool.tokenSymbol}! Tx: ${result.tx.slice(0, 8)}...`,
      });
      
      setDonateModalOpen(false);
      setDonateAmount("");
      invalidateQueries();
    } catch (err) {
      console.error("=== DONATE_ERROR ===", err);
      toast({
        variant: "destructive",
        title: "Donation Failed",
        description: err instanceof Error ? err.message : "Transaction failed",
      });
    } finally {
      setIsDonating(false);
    }
  }, [isConnected, address, poolAddress, pool, poolId, donateAmount, donateToPool, toast, connect, invalidateQueries]);

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
      console.log("=== SDK_CANCEL_ENTER ===");
      const result = await cancelPool(poolAddress);

      if (!result?.tx) {
        throw new Error("No transaction signature returned from cancel");
      }

      console.log("=== CANCEL_TX_CONFIRMED ===", result.tx);
      const explorerUrl = getSolscanTxUrl(result.tx);

      toast({
        title: "Pool Cancelled",
        description: `Black hole collapsed. Tx: ${result.tx.slice(0, 8)}...`,
      });
      console.log("Cancel tx:", explorerUrl);

      setTimeout(() => { invalidateQueries(); }, 1000);
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

      toast({
        variant: "destructive",
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
      toast({
        title: "Refund Claimed",
        description: `Tokens returned. Tx: ${result.tx.slice(0, 8)}...`,
      });
      console.log("Refund tx:", getSolscanTxUrl(result.tx));
      invalidateQueries();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Refund Failed",
        description: err instanceof Error ? err.message : "Transaction failed",
      });
    } finally {
      setIsClaimingRefund(false);
    }
  }, [poolAddress, claimRefund, toast, invalidateQueries]);

  if (isLoading) return <div className="min-h-screen bg-black flex items-center justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;
  if (error || !pool) return <div className="min-h-screen bg-black flex items-center justify-center text-red-500">Error loading pool</div>;

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden relative">
      <Navbar />

      {/* Hero Section with Black Hole */}
      <div className="relative h-[60vh] flex items-center justify-center border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,240,255,0.05)_0%,transparent_70%)]" />
        
        <div className="z-10 w-full max-w-2xl px-4 text-center">
          <BlackHoleCore 
            intensity={(pool.participantsCount ?? 0) / pool.maxParticipants} 
            status={pool.status} 
          />
        </div>

        {/* Overlay Stats */}
        <div className="absolute bottom-8 left-0 right-0 container mx-auto px-4 flex justify-between items-end">
          <div>
            <h1 className="text-5xl font-display font-black mb-2 tracking-tighter">
              {pool.tokenSymbol} <span className="text-primary">BLACK HOLE</span>
            </h1>
            <div className="flex items-center gap-4 text-sm font-tech text-muted-foreground uppercase">
              <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {pool.lockDuration}m Event Horizon</span>
              <span className="flex items-center gap-1"><Coins className="w-4 h-4" /> {pool.entryAmount} SOL Entry</span>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-4xl font-mono font-bold text-neon-cyan">
              {(pool.totalPot || 0).toFixed(2)} SOL
            </div>
            <div className="text-sm font-tech text-muted-foreground uppercase tracking-widest">Total Pot</div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="container mx-auto px-4 py-8">
        <DevnetReadiness />
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Col: Actions & Status */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Winner Reveal Area */}
            <AnimatePresence mode="wait">
              {showRoulette ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-zinc-900 border border-yellow-500/50 rounded-lg overflow-hidden"
                >
                  <div className="bg-yellow-500/10 p-2 text-center text-yellow-500 font-bold uppercase text-xs tracking-widest border-b border-yellow-500/20">
                    SINGULARITY REACHED
                  </div>
                  <RouletteReveal
                    participants={pool.participantsCount ? [{
                      id: 0,
                      poolId: pool.id,
                      walletAddress: pool.winnerWallet!,
                      avatar: "",
                      joinedAt: new Date()
                    }] : []}
                    winnerAddress={pool.winnerWallet}
                    onComplete={() => {
                      setWinnerRevealed(true);
                      // Keep roulette visible but mark as done
                    }}
                  />
                </motion.div>
              ) : winnerRevealed || (pool.status === 'ended' && pool.winnerWallet) ? (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0, filter: "blur(10px)" }}
                  animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                  className="relative bg-zinc-900/80 border-2 border-primary p-8 rounded-xl shadow-[0_0_50px_rgba(0,240,255,0.3)] overflow-hidden"
                >
                  {/* Background pulse */}
                  <motion.div
                    animate={{ opacity: [0.1, 0.3, 0.1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 bg-primary/20"
                  />

                  <div className="relative z-10 text-center">
                    {/* Trophy Icon */}
                    <motion.div
                      initial={{ y: 20 }}
                      animate={{ y: 0 }}
                      className="inline-block p-4 rounded-full bg-primary/20 mb-4 border border-primary/50"
                    >
                      <Trophy className="w-12 h-12 text-primary drop-shadow-[0_0_15px_rgba(0,240,255,1)]" />
                    </motion.div>

                    {/* Title */}
                    <h2 className="text-4xl font-display font-black text-white mb-2 tracking-tighter italic uppercase">
                      ESCAPED THE <span className="text-primary">VOID</span>
                    </h2>

                    {/* Winner Wallet */}
                    <div className="bg-black/50 py-3 px-6 rounded-lg inline-block border border-white/5 mb-6">
                      <p className="font-mono text-primary text-lg font-black tracking-widest">
                        {pool.winnerWallet ? `${pool.winnerWallet.slice(0, 4)}...${pool.winnerWallet.slice(-4)}` : 'Unknown'}
                      </p>
                    </div>

                    {/* Token Breakdown */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                      <div className="bg-black/30 p-4 rounded-lg border border-primary/30 text-center">
                        <div className="text-xs text-muted-foreground font-tech uppercase tracking-wider mb-1">
                          Winner Payout
                        </div>
                        <div className="text-2xl font-mono font-black text-primary">
                          {((pool.totalPot || 0) * 0.90).toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{pool.tokenSymbol}</div>
                      </div>

                      <div className="bg-black/30 p-4 rounded-lg border border-white/10 text-center">
                        <div className="text-xs text-muted-foreground font-tech uppercase tracking-wider mb-1">
                          DEV Fee
                        </div>
                        <div className="text-2xl font-mono font-black text-white">
                          {((pool.totalPot || 0) * 0.05).toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">5%</div>
                      </div>

                      <div className="bg-black/30 p-4 rounded-lg border border-white/10 text-center">
                        <div className="text-xs text-muted-foreground font-tech uppercase tracking-wider mb-1">
                          Burned
                        </div>
                        <div className="text-2xl font-mono font-black text-orange-400">
                          {((pool.totalPot || 0) * 0.035).toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">3.5%</div>
                      </div>

                      <div className="bg-black/30 p-4 rounded-lg border border-white/10 text-center">
                        <div className="text-xs text-muted-foreground font-tech uppercase tracking-wider mb-1">
                          Treasury
                        </div>
                        <div className="text-2xl font-mono font-black text-white">
                          {((pool.totalPot || 0) * 0.015).toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">1.5%</div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : pool.status === 'winnerSelected' && !pool.winnerWallet ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-6 text-center"
                >
                  <Loader2 className="w-8 h-8 text-yellow-500 animate-spin mx-auto mb-3" />
                  <p className="text-yellow-500 font-tech uppercase tracking-wider">
                    Waiting for payout...
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>

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
                      !isConnected ? "Connect Wallet to Join" : `Get Pulled In (${pool.entryAmount} ${pool.tokenSymbol})`
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
                    <Button
                      variant="destructive"
                      onClick={handleCancel}
                      disabled={isCancelling || !sdkConnected}
                      className="w-full gap-2"
                      data-testid="button-cancel-pool"
                    >
                      {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                      Cancel Pool
                    </Button>
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
                      console.log("=== DONATE_OPEN_MODAL ===");
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

              {/* Countdown Timer - only shows when pool is locked */}
              {pool.status === 'locked' && countdown !== null && (
                <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
                  <div className="text-xs text-yellow-500 font-tech uppercase tracking-widest mb-2">
                    Event Horizon Countdown
                  </div>
                  {countdown > 0 ? (
                    <div className="text-3xl font-mono font-bold text-yellow-400">
                      {Math.floor(countdown / 60).toString().padStart(2, '0')}:
                      {(countdown % 60).toString().padStart(2, '0')}
                    </div>
                  ) : (
                    <div className="text-lg font-bold text-yellow-400">
                      Lock expired - awaiting resolution
                    </div>
                  )}
                </div>
              )}

              {/* Waiting for players - when pool is open */}
              {pool.status === 'open' && (
                <div className="mt-6 p-4 bg-primary/10 border border-primary/30 rounded-lg text-center">
                  <div className="text-xs text-primary font-tech uppercase tracking-widest mb-2">
                    Waiting for players
                  </div>
                  <div className="text-lg font-mono text-primary">
                    {pool.participantsCount || 0} / {pool.maxParticipants} joined
                  </div>
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
              <div className="text-center text-muted-foreground py-10 text-sm">
                Participants list loading...
              </div>
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
                  console.log("=== DONATE_AMOUNT_SET ===", e.target.value);
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
    </div>
  );
}
