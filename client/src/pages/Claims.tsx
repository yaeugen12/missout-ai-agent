import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useMissoutSDK } from "@/hooks/useMissoutSDK";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Wallet, RefreshCw, ArrowUpFromLine, Coins, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BatchClaimProgress } from "@/lib/solana-sdk";
import bs58 from "bs58";

interface PoolForClaim {
  id: number;
  onChainAddress: string;
  status: string;
  tokenMint: string;
  tokenSymbol: string;
  tokenLogoUrl?: string;
  entryFee: string;
  creatorWallet: string;
  participants: string[];
}

export default function Claims() {
  const { publicKey, connected, signMessage } = useWallet();
  const { claimRefund, claimRent, claimRefundsBatch, claimRentsBatch } = useMissoutSDK();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [claimingRefund, setClaimingRefund] = useState<string | null>(null);
  const [claimingRent, setClaimingRent] = useState<string | null>(null);
  const [claimingAllRefunds, setClaimingAllRefunds] = useState(false);
  const [claimingAllRents, setClaimingAllRents] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchClaimProgress | null>(null);

  const walletAddress = publicKey?.toBase58();

  const { data: claimablePools, isLoading } = useQuery({
    queryKey: ["/api/pools/claimable", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return { refunds: [], rents: [] };
      const res = await fetch(`/api/pools/claimable?wallet=${walletAddress}`);
      if (!res.ok) throw new Error("Failed to fetch claimable pools");
      return res.json();
    },
    enabled: !!walletAddress,
    refetchInterval: 30000,
  });

  const handleClaimRefund = useCallback(async (pool: PoolForClaim) => {
    if (!pool.onChainAddress || !walletAddress || !publicKey || !signMessage) return;

    setClaimingRefund(pool.onChainAddress);
    try {
      // Claim on blockchain
      const result = await claimRefund(pool.onChainAddress);

      // Wait 2 seconds for transaction to propagate to all RPC nodes
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Sign message to prove wallet ownership
      const timestamp = Date.now();
      const message = `claim-refund:${pool.id}:${timestamp}`;
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);

      // Mark as claimed in database
      const response = await fetch(`/api/pools/${pool.id}/claim-refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: walletAddress,
          txHash: result.tx,
          signature,
          message
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to mark refund as claimed');
      }

      toast({
        title: "Refund Claimed!",
        description: `Your tokens escaped the collapsed pool. TX: ${result.tx.slice(0, 8)}...`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pools/claimable"] });
    } catch (error: any) {
      console.error("Claim refund error:", error);
      toast({
        title: "Refund Failed",
        description: error.message || "Failed to claim refund",
        variant: "destructive",
      });
    } finally {
      setClaimingRefund(null);
    }
  }, [claimRefund, walletAddress, publicKey, signMessage, toast, queryClient]);

  const handleClaimRent = useCallback(async (pool: PoolForClaim) => {
    if (!pool.onChainAddress || !publicKey || !walletAddress || !signMessage) return;

    setClaimingRent(pool.onChainAddress);
    try {
      // Claim on blockchain
      const result = await claimRent(pool.onChainAddress, publicKey);

      // Wait 2 seconds for transaction to propagate to all RPC nodes
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Sign message to prove wallet ownership
      const timestamp = Date.now();
      const message = `claim-rent:${pool.id}:${timestamp}`;
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);

      // Mark as claimed in database
      const response = await fetch(`/api/pools/${pool.id}/claim-rent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: walletAddress,
          txHash: result.tx,
          signature,
          message
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to mark rent as claimed');
      }

      toast({
        title: "Rent Reclaimed!",
        description: `Gravitational costs recovered. TX: ${result.tx.slice(0, 8)}...`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pools/claimable"] });
    } catch (error: any) {
      console.error("Claim rent error:", error);
      toast({
        title: "Rent Claim Failed",
        description: error.message || "Failed to claim rent",
        variant: "destructive",
      });
    } finally {
      setClaimingRent(null);
    }
  }, [claimRent, publicKey, walletAddress, signMessage, toast, queryClient]);

  const handleClaimAllRefunds = useCallback(async (pools: PoolForClaim[]) => {
    if (pools.length === 0) return;
    
    const poolIds = pools.map(p => p.onChainAddress).filter(Boolean);
    if (poolIds.length === 0) return;

    setClaimingAllRefunds(true);
    setBatchProgress(null);

    try {
      const results = await claimRefundsBatch(poolIds, (progress) => {
        setBatchProgress(progress);
      });

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      if (successful > 0) {
        toast({
          title: "Batch Refund Complete!",
          description: `${successful} refund${successful > 1 ? 's' : ''} claimed${failed > 0 ? `, ${failed} failed` : ''}`,
        });
      }

      if (failed > 0 && successful === 0) {
        toast({
          title: "Batch Refund Failed",
          description: `All ${failed} claims failed`,
          variant: "destructive",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/pools/claimable"] });
    } catch (error: any) {
      console.error("Batch refund error:", error);
      toast({
        title: "Batch Refund Failed",
        description: error.message || "Failed to claim refunds",
        variant: "destructive",
      });
    } finally {
      setClaimingAllRefunds(false);
      setBatchProgress(null);
    }
  }, [claimRefundsBatch, toast, queryClient]);

  const handleClaimAllRents = useCallback(async (pools: PoolForClaim[]) => {
    if (pools.length === 0 || !publicKey) return;
    
    const poolIds = pools.map(p => p.onChainAddress).filter(Boolean);
    if (poolIds.length === 0) return;

    setClaimingAllRents(true);
    setBatchProgress(null);

    try {
      const results = await claimRentsBatch(poolIds, publicKey, (progress) => {
        setBatchProgress(progress);
      });

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      if (successful > 0) {
        toast({
          title: "Batch Rent Claim Complete!",
          description: `${successful} rent claim${successful > 1 ? 's' : ''} processed${failed > 0 ? `, ${failed} failed` : ''}`,
        });
      }

      if (failed > 0 && successful === 0) {
        toast({
          title: "Batch Rent Claim Failed",
          description: `All ${failed} claims failed`,
          variant: "destructive",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/pools/claimable"] });
    } catch (error: any) {
      console.error("Batch rent claim error:", error);
      toast({
        title: "Batch Rent Claim Failed",
        description: error.message || "Failed to claim rent",
        variant: "destructive",
      });
    } finally {
      setClaimingAllRents(false);
      setBatchProgress(null);
    }
  }, [claimRentsBatch, publicKey, toast, queryClient]);

  if (!connected) {
    return (
      <div className="min-h-screen bg-black bg-grid-pattern">
        <main className="container mx-auto px-4 py-12">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-display font-black text-white mb-4 tracking-tight">
              <span className="text-primary text-neon-cyan">CLAIMS</span> CENTER
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Recover your tokens from collapsed pools and reclaim rent from closed voids.
            </p>
          </div>
          
          <div className="max-w-md mx-auto bg-zinc-900/30 border border-white/10 rounded-lg p-8 text-center backdrop-blur-sm">
            <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Connect your wallet to view claims</p>
          </div>
        </main>
      </div>
    );
  }

  const refundPools: PoolForClaim[] = claimablePools?.refunds || [];
  const rentPools: PoolForClaim[] = claimablePools?.rents || [];

  return (
    <div className="min-h-screen bg-black bg-grid-pattern">
      <main className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg">
              <ArrowUpFromLine className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-black text-white mb-4 tracking-tight">
            <span className="text-primary text-neon-cyan">CLAIMS</span> CENTER
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Recover your tokens from collapsed pools and reclaim rent from closed voids.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <Tabs defaultValue="refunds" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-zinc-900/50 border border-white/10 rounded-lg p-1 mb-8">
              <TabsTrigger 
                value="refunds" 
                className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400 data-[state=active]:border-cyan-500/50 border border-transparent rounded-md font-tech uppercase tracking-wider text-sm py-3"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refunds ({refundPools.length})
              </TabsTrigger>
              <TabsTrigger 
                value="rent" 
                className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 data-[state=active]:border-amber-500/50 border border-transparent rounded-md font-tech uppercase tracking-wider text-sm py-3"
              >
                <Coins className="w-4 h-4 mr-2" />
                Rent ({rentPools.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="refunds" className="mt-0">
              <div className="bg-zinc-900/30 border border-cyan-500/20 rounded-lg p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-6 border-b border-cyan-500/20 pb-4">
                  <div className="flex items-center gap-3">
                    <RefreshCw className="w-5 h-5 text-cyan-400" />
                    <h2 className="text-lg font-display font-bold text-cyan-400">Available Refunds</h2>
                  </div>
                  {refundPools.length > 1 && (
                    <Button
                      onClick={() => handleClaimAllRefunds(refundPools)}
                      disabled={claimingAllRefunds || !!claimingRefund}
                      className="bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-black font-tech uppercase text-xs flex items-center gap-2"
                    >
                      {claimingAllRefunds ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {batchProgress ? `${batchProgress.current}/${batchProgress.total}` : 'Processing...'}
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          Claim All ({refundPools.length})
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                  </div>
                ) : refundPools.length === 0 ? (
                  <div className="text-center py-12">
                    <Sparkles className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-muted-foreground">No refunds available</p>
                    <p className="text-xs text-muted-foreground/50 mt-2">
                      Refunds appear when pools are cancelled
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {refundPools.map((pool) => (
                      <div 
                        key={pool.onChainAddress}
                        className={cn(
                          "flex items-center justify-between p-4 bg-black/40 rounded-lg border transition-all duration-300",
                          claimingRefund === pool.onChainAddress 
                            ? "border-cyan-500/50 shadow-[0_0_20px_rgba(0,255,255,0.2)]" 
                            : "border-white/5 hover:border-cyan-500/30"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          {pool.tokenLogoUrl ? (
                            <img 
                              src={pool.tokenLogoUrl} 
                              alt={pool.tokenSymbol}
                              className="w-10 h-10 rounded-full border border-white/10"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                              <span className="text-xs font-bold text-cyan-400">
                                {pool.tokenSymbol?.slice(0, 2) || "?"}
                              </span>
                            </div>
                          )}
                          <div>
                            <div className="font-mono text-sm text-white">
                              Pool #{pool.id}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{pool.tokenSymbol}</span>
                              <span className="text-cyan-500/50">•</span>
                              <span>{pool.entryFee} tokens</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-1 text-[10px] font-tech uppercase bg-red-500/10 text-red-400 border border-red-500/30 rounded">
                            {pool.status}
                          </span>
                          <Button
                            size="sm"
                            onClick={() => handleClaimRefund(pool)}
                            disabled={claimingRefund === pool.onChainAddress}
                            className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-500 hover:text-black transition-all font-tech uppercase text-xs"
                          >
                            {claimingRefund === pool.onChainAddress ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              "Claim Refund"
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="rent" className="mt-0">
              <div className="bg-zinc-900/30 border border-amber-500/20 rounded-lg p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-6 border-b border-amber-500/20 pb-4">
                  <div className="flex items-center gap-3">
                    <Coins className="w-5 h-5 text-amber-400" />
                    <h2 className="text-lg font-display font-bold text-amber-400">Rent Recovery</h2>
                  </div>
                  {rentPools.length > 1 && (
                    <Button
                      onClick={() => handleClaimAllRents(rentPools)}
                      disabled={claimingAllRents || !!claimingRent}
                      className="bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-black font-tech uppercase text-xs flex items-center gap-2"
                    >
                      {claimingAllRents ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {batchProgress ? `${batchProgress.current}/${batchProgress.total}` : 'Processing...'}
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          Claim All ({rentPools.length})
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                  </div>
                ) : rentPools.length === 0 ? (
                  <div className="text-center py-12">
                    <Coins className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-muted-foreground">No rent to reclaim</p>
                    <p className="text-xs text-muted-foreground/50 mt-2">
                      Rent can be reclaimed from ended or cancelled pools you created
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {rentPools.map((pool) => (
                      <div 
                        key={pool.onChainAddress}
                        className={cn(
                          "flex items-center justify-between p-4 bg-black/40 rounded-lg border transition-all duration-300",
                          claimingRent === pool.onChainAddress 
                            ? "border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)]" 
                            : "border-white/5 hover:border-amber-500/30"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          {pool.tokenLogoUrl ? (
                            <img 
                              src={pool.tokenLogoUrl} 
                              alt={pool.tokenSymbol}
                              className="w-10 h-10 rounded-full border border-white/10"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                              <span className="text-xs font-bold text-amber-400">
                                {pool.tokenSymbol?.slice(0, 2) || "?"}
                              </span>
                            </div>
                          )}
                          <div>
                            <div className="font-mono text-sm text-white">
                              Pool #{pool.id}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{pool.tokenSymbol}</span>
                              <span className="text-amber-500/50">•</span>
                              <span>Creator</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "px-2 py-1 text-[10px] font-tech uppercase border rounded",
                            pool.status === "ended" 
                              ? "bg-green-500/10 text-green-400 border-green-500/30"
                              : "bg-red-500/10 text-red-400 border-red-500/30"
                          )}>
                            {pool.status}
                          </span>
                          <Button
                            size="sm"
                            onClick={() => handleClaimRent(pool)}
                            disabled={claimingRent === pool.onChainAddress}
                            className="bg-amber-500/10 text-amber-400 border border-amber-500/50 hover:bg-amber-500 hover:text-black transition-all font-tech uppercase text-xs"
                          >
                            {claimingRent === pool.onChainAddress ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              "Claim Rent"
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
