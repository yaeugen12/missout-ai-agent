// BUILD_ID: v10-cancel-pool-not-full
const BUILD_ID = "v10-cancel-pool-not-full";
console.log("=== POOL_DETAILS_LOADED ===", BUILD_ID);

import { useParams } from "wouter";
import { usePool } from "@/hooks/use-pools";
import { useWallet } from "@/hooks/use-wallet";
import { Navbar } from "@/components/Navbar";
import { BlackHoleExperience } from "@/components/BlackHoleExperience";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Trophy, Clock, Users, Coins, AlertTriangle, Ban, RefreshCw, Zap, Gift, XCircle, Heart } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQueries } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { api } from "@/types/shared";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { useMissoutSDK } from "@/hooks/useMissoutSDK";
import { MissoutClient, getMissoutClient } from "@/lib/solana-sdk/client";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getSolscanTxUrl } from "@/hooks/use-sdk-transaction";
import { DevnetReadiness } from "@/components/DevnetReadiness";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

function ParticipantRow({ walletAddress }: { walletAddress: string }) {
  const { data: profile, isLoading } = useQueries({
    queries: [{
      queryKey: [api.profiles.get.path.replace(":wallet", walletAddress)],
      queryFn: () => fetch(api.profiles.get.path.replace(":wallet", walletAddress)).then(res => res.json()),
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
      
      // Notify backend about cancellation (optional but good for tracking)
      try {
        await apiRequest("POST", `/api/pools/${poolId}/cancel`, {
          walletAddress: address,
          txHash: result.tx,
        });
      } catch (err) {
        console.warn("Backend notification failed", err);
      }

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
      
      // Notify backend about refund
      try {
        await apiRequest("POST", `/api/pools/${poolId}/refund`, {
          walletAddress: address,
          txHash: result.tx,
        });
      } catch (err) {
        console.warn("Backend notification failed", err);
      }

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

  // Find winner's profile data from participants list
  const participants = (pool as any).participants || [];
  const winnerParticipant = pool.winnerWallet 
    ? participants.find((p: any) => p.walletAddress === pool.winnerWallet)
    : null;
  const winnerDisplayName = winnerParticipant?.displayName;
  const winnerAvatar = winnerParticipant?.displayAvatar;

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden relative">
      {/* Hero Section with Black Hole */}
      <div className="relative h-[100vh] flex flex-col items-center justify-center border-b border-white/10 pt-28 overflow-hidden bg-black">
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
            payoutTxHash={(pool as any).payoutTxHash}
          />
        </div>

        {/* Content Overlay - Moved completely below the visual */}
        <div className="w-full container mx-auto px-4 z-20 pb-12 mt-auto">
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
            
            <div className="flex flex-col items-center md:items-end bg-zinc-900/40 p-6 rounded-2xl border border-white/10 backdrop-blur-xl">
              <div className="text-[10px] font-tech text-muted-foreground uppercase tracking-[0.4em] mb-2 opacity-60">Singularity Mass</div>
              <div className="text-5xl md:text-6xl font-mono font-black text-neon-cyan drop-shadow-[0_0_20px_rgba(0,240,255,0.3)] leading-none tracking-tighter">
                {(pool.totalPot || 0).toFixed(2)}
              </div>
              <div className="text-xs font-mono font-black text-primary mt-3 uppercase tracking-[0.3em] opacity-80">{pool.tokenSymbol}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="container mx-auto px-4 py-8">
        <DevnetReadiness />
        
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
