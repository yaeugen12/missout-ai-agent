// BUILD_ID: v7-20260103-2045 - IDL Account Order + Args Size Fix
const BUILD_ID = "v7-20260103-2045";
console.log("=== CREATEPOOLWIZARD MODULE v7 ===", BUILD_ID);

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowRight, ArrowLeft, Loader2, Check, Rocket, CircleDot, FlaskConical, AlertTriangle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// Backend DEV wallet authorized for pool operations (unlock, randomness, select_winner, payout)
const DEV_WALLET_PUBKEY = "DCHhAjoVvJ4mUUkbQrsKrPztRhivrNV3fDJEZfHNQ8d3";
// Treasury wallet that receives fees for referral rewards
const TREASURY_WALLET_PUBKEY = "4ZscUyoKFWfU7wjeZKpiuw7Nr8Q8ZdAQmr4YzHNQ74B3";
// Sponsor wallet that can create FREE pools
const SPONSOR_WALLET_PUBKEY = "HeXjPXForQumceDJHA6w5d4vPR11mPMDGmtcz5ZHezBZ";
import { apiFetch } from "@/lib/api";
import { useLocation } from "wouter";
import { useWallet } from "@/hooks/use-wallet";
import { useMissoutSDK } from "@/hooks/useMissoutSDK";
import { PublicKey } from "@solana/web3.js";
import { protocolAdapter, type TokenInfo, type TokenPriceData } from "@/lib/protocolAdapter";
import type { Pool } from "@/types/shared";

interface CreatePoolWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillMintAddress?: string;
}

interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  priceUSD?: number;
}

export function CreatePoolWizard({ open, onOpenChange, prefillMintAddress }: CreatePoolWizardProps) {
  const [step, setStep] = useState(1);

  // Debug: Log step changes
  useEffect(() => {
    console.log('[DEBUG CreatePoolWizard] Current step:', step);
  }, [step]);

  const [mintAddress, setMintAddress] = useState("");

  // Prefill mint address when provided
  useEffect(() => {
    if (prefillMintAddress && open) {
      setMintAddress(prefillMintAddress);
    }
  }, [prefillMintAddress, open]);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [entryAmount, setEntryAmount] = useState("1");
  const [participants, setParticipants] = useState(10);
  const [lockDuration, setLockDuration] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingToken, setIsLoadingToken] = useState(false);
  const [tokenPriceData, setTokenPriceData] = useState<TokenPriceData | null>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [isFreePool, setIsFreePool] = useState(false);

  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { address, isConnected, connect } = useWallet();
  const { createPool: createPoolOnChain, sdkReady, publicKey } = useMissoutSDK();

  const { mutate: createPoolBackend } = useMutation({
    mutationFn: async (data: any) => {
      console.log("=== POST_TO_BACKEND ===");
      console.log("POST_BODY:", JSON.stringify(data, null, 2));
      const res = await apiFetch("/api/pools", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include'
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pools"] });
    },
  });

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(1);
        setMintAddress("");
        setTokenInfo(null);
        setTokenPriceData(null);
        setEntryAmount("1");
        setParticipants(10);
        setLockDuration(5);
        setIsFreePool(false);
      }, 300);
    }
  }, [open]);

  // Fetch token price using protocolAdapter (tries multiple sources with accuracy checking)
  const fetchTokenPrice = async (mintAddress: string): Promise<TokenPriceData | null> => {
    try {
      return await protocolAdapter.fetchTokenPriceUsd(mintAddress);
    } catch (error) {
      console.error("Price fetch error:", error);
      return null;
    }
  };

  useEffect(() => {
    const checkToken = async () => {
      if (mintAddress.length >= 32 && mintAddress.length <= 44) {
        setIsLoadingToken(true);
        setIsLoadingPrice(true);
        try {
          const info = await protocolAdapter.fetchTokenInfo(mintAddress);
          if (info) {
            setTokenInfo({
              mint: mintAddress,
              name: info.name || "Unknown Token",
              symbol: info.symbol || mintAddress.slice(0, 6).toUpperCase(),
              decimals: info.decimals,
              logoURI: info.logoUrl,
            });

            // Fetch price
            const priceData = await fetchTokenPrice(mintAddress);
            setTokenPriceData(priceData);
          }
        } catch (error) {
          console.error("Token fetch error:", error);
          setTokenInfo(null);
          setTokenPriceData(null);
        } finally {
          setIsLoadingToken(false);
          setIsLoadingPrice(false);
        }
      } else {
        setTokenInfo(null);
        setTokenPriceData(null);
      }
    };
    checkToken();
  }, [mintAddress]);

  const handleCreate = async () => {
    const timestamp = Date.now();
    console.log("==============================================");
    console.log("=== CLICK: Initialize Black Hole ===", BUILD_ID);
    console.log("Timestamp:", timestamp);
    console.log("WALLET_STATE:", { 
      isConnected, 
      address, 
      sdkReady, 
      pk: publicKey?.toBase58() 
    });

    if (!isConnected || !address) {
      console.error("ABORT: Wallet not connected");
      toast({ variant: "destructive", title: "Wallet Not Connected", description: "Please connect your wallet first." });
      connect();
      return;
    }

    if (!tokenInfo) {
      console.error("ABORT: No token selected");
      toast({ variant: "destructive", title: "No Token Selected", description: "Please select a token first." });
      return;
    }

    if (!sdkReady || !publicKey) {
      console.error("ABORT: SDK not ready or publicKey null");
      toast({ variant: "destructive", title: "SDK Not Ready", description: "Wallet not fully connected. Please reconnect." });
      return;
    }

    setIsSubmitting(true);
    
    let signature: string | undefined;
    let poolAddress: string | undefined;
    
    try {
      const mintPubkey = new PublicKey(tokenInfo.mint);
      const lockDurationSeconds = lockDuration * 60;

      console.log("=== SDK_ENTER ===");
      console.log("Params:", {
        mint: mintPubkey.toBase58(),
        amount: entryAmount,
        maxParticipants: participants,
        lockDurationSeconds,
        devWallet: DEV_WALLET_PUBKEY,
        creator: publicKey.toBase58(),
      });

      const sdkResult = await createPoolOnChain({
        mint: mintPubkey,
        amount: entryAmount,
        maxParticipants: participants,
        lockDurationSeconds,
        devWallet: new PublicKey(DEV_WALLET_PUBKEY),
        devFeeBps: 500,      // 5% dev fee
        burnFeeBps: 350,     // 3.5% burn fee
        treasuryWallet: new PublicKey(TREASURY_WALLET_PUBKEY),
        treasuryFeeBps: 150, // 1.5% treasury fee for referral rewards
      });

      console.log("=== SDK_RETURNED ===");
      console.log("SIGNATURE:", sdkResult?.tx);
      console.log("POOL_PDA:", sdkResult?.poolId);

      signature = sdkResult?.tx;
      poolAddress = sdkResult?.poolId;

    } catch (err: any) {
      setIsSubmitting(false);
      console.error("=== SDK_ERROR ===", err);
      toast({ 
        variant: "destructive", 
        title: "Transaction Failed", 
        description: err.message || "Could not create pool on-chain"
      });
      return;
    }

    // ANTI-FAKE GUARD: Stop here if no signature
    if (!signature) {
      setIsSubmitting(false);
      console.error("=== GUARD_NO_SIGNATURE ===");
      toast({ variant: "destructive", title: "No Signature", description: "Wallet did not return a transaction signature." });
      return;
    }

    if (!poolAddress) {
      setIsSubmitting(false);
      console.error("=== GUARD_NO_POOL_PDA ===");
      toast({ variant: "destructive", title: "No Pool Address", description: "Could not derive pool address." });
      return;
    }

    console.log("=== GUARDS_PASSED ===");
    console.log("SIGNATURE:", signature);
    console.log("POOL_ADDRESS:", poolAddress);
    console.log(`Explorer: https://explorer.solana.com/tx/${signature}`);

    toast({ title: "On-Chain Success", description: `TX: ${signature.slice(0, 8)}...` });

    console.log("[CREATE POOL] tokenInfo.logoURI:", tokenInfo.logoURI);

    const postBody = {
      tokenSymbol: tokenInfo.symbol,
      tokenName: tokenInfo.name,
      tokenMint: tokenInfo.mint,
      tokenLogoUrl: tokenInfo.logoURI || null,
      poolAddress: poolAddress,
      txHash: signature,
      entryAmount: parseFloat(entryAmount),
      minParticipants: 2,
      maxParticipants: participants,
      lockDuration: Number(lockDuration),
      creatorWallet: address,
      ...(isFreePool && {
        isFree: 1,
        sponsoredBy: address,
      }),
    };

    console.log("=== POST_BODY ===");
    console.log(JSON.stringify(postBody, null, 2));

    createPoolBackend(postBody, {
      onSuccess: (pool: Pool) => {
        setIsSubmitting(false);
        console.log("=== BACKEND_SUCCESS ===", pool.id);
        toast({ title: "Black Hole Initialized", description: "The singularity has been created." });
        onOpenChange(false);
        setLocation(`/pool/${pool.id}`);
      },
      onError: (err: any) => {
        setIsSubmitting(false);
        console.error("=== BACKEND_ERROR ===", err);
        toast({ variant: "destructive", title: "Backend Sync Failed", description: "Pool created on-chain but not saved to database." });
      }
    });
  };

  const reset = () => {
    setStep(1);
    setMintAddress("");
    setTokenInfo(null);
    setEntryAmount("1");
    setParticipants(10);
    setLockDuration(5);
    setIsFreePool(false);
  };

  const canProceedStep1 = mintAddress.length >= 32 && tokenInfo !== null;

  // Step 2: Validate entry amount and $5 USD minimum
  const canProceedStep2 = (() => {
    const amount = parseFloat(entryAmount);
    if (amount <= 0) return false;

    // If price is available, enforce $5 USD minimum
    if (tokenPriceData?.priceUsd) {
      const usdValue = amount * tokenPriceData.priceUsd;
      return usdValue >= 5;
    }

    // If price unavailable, allow proceeding (user takes risk)
    return true;
  })();

  const canProceedStep3 = participants >= 2 && lockDuration >= 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card/95 backdrop-blur-xl border-primary/20 overflow-hidden">
        <div className="absolute top-2 right-12 z-50">
          <Badge variant="outline" className="text-xs font-mono opacity-60" data-testid="badge-build-id">
            {BUILD_ID}
          </Badge>
        </div>
        
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
        
        <div className="flex justify-center gap-2 mb-4 relative z-10">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 w-12 rounded-full transition-all duration-300 ${
                s <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <DialogHeader className="relative z-10">
          <DialogTitle className="text-2xl font-display font-black tracking-tight italic uppercase">
            {step === 1 && "Targeting System"}
            {step === 2 && "Vessel Identified"}
            {step === 3 && "Event Horizon Config"}
            {step === 4 && `Final Initiation (${BUILD_ID})`}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 min-h-[300px] flex flex-col">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4 flex-1"
              >
                <div className="space-y-2">
                  <Label htmlFor="mint" className="text-foreground/80">
                    Token Mint Address
                  </Label>
                  <Input
                    id="mint"
                    placeholder="Enter SPL token mint address..."
                    value={mintAddress}
                    onChange={(e) => setMintAddress(e.target.value)}
                    className="font-mono text-sm bg-background/50"
                    data-testid="input-mint-address"
                  />
                </div>

                {isLoadingToken && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Scanning token...</span>
                  </div>
                )}

                {tokenInfo && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-4 rounded-lg bg-primary/10 border border-primary/20"
                  >
                    <div className="flex items-center gap-3">
                      {tokenInfo.logoURI ? (
                        <img src={tokenInfo.logoURI} alt={tokenInfo.symbol} className="w-10 h-10 rounded-full" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                          <CircleDot className="w-6 h-6 text-primary" />
                        </div>
                      )}
                      <div>
                        <p className="font-bold">{tokenInfo.name}</p>
                        <p className="text-sm text-muted-foreground">${tokenInfo.symbol}</p>
                      </div>
                      <Check className="w-5 h-5 text-green-500 ml-auto" />
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {step === 2 && tokenInfo && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4 flex-1"
              >
                <div className="text-center p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    {tokenInfo.logoURI ? (
                      <img src={tokenInfo.logoURI} alt={tokenInfo.symbol} className="w-12 h-12 rounded-full" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                        <CircleDot className="w-8 h-8 text-primary" />
                      </div>
                    )}
                  </div>
                  <p className="text-xl font-bold">{tokenInfo.name}</p>
                  <p className="text-muted-foreground">${tokenInfo.symbol}</p>

                  <div className="mt-3 pt-3 border-t border-white/10">
                    {isLoadingPrice ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Loading price...</span>
                      </div>
                    ) : tokenPriceData ? (
                      <div className="space-y-2">
                        {/* Price Discrepancy Warning */}
                        {tokenPriceData.priceDiscrepancy && (
                          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                            <div className="flex items-center gap-2 text-xs text-amber-400">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Price varies across sources - using {tokenPriceData.source}</span>
                            </div>
                          </div>
                        )}

                        {/* Price */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">Current Price</p>
                            <p className="text-xs text-muted-foreground/60">via {tokenPriceData.source}</p>
                          </div>
                          <p className="text-lg font-mono font-bold text-primary">
                            ${tokenPriceData.priceUsd.toFixed(Math.max(3, -Math.floor(Math.log10(tokenPriceData.priceUsd)) + 2))}
                          </p>
                        </div>

                        {/* Market Cap and Liquidity */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {tokenPriceData.marketCapUsd && (
                            <div className="p-2 rounded-lg bg-background/50">
                              <p className="text-muted-foreground mb-0.5">Market Cap</p>
                              <p className="font-mono font-semibold text-foreground">
                                {tokenPriceData.marketCapUsd >= 1000000
                                  ? `$${(tokenPriceData.marketCapUsd / 1000000).toFixed(2)}M`
                                  : tokenPriceData.marketCapUsd >= 1000
                                  ? `$${(tokenPriceData.marketCapUsd / 1000).toFixed(2)}K`
                                  : `$${tokenPriceData.marketCapUsd.toFixed(2)}`}
                              </p>
                            </div>
                          )}
                          {tokenPriceData.liquidityUsd && (
                            <div className="p-2 rounded-lg bg-background/50">
                              <p className="text-muted-foreground mb-0.5">Liquidity</p>
                              <p className="font-mono font-semibold text-foreground">
                                {tokenPriceData.liquidityUsd >= 1000000
                                  ? `$${(tokenPriceData.liquidityUsd / 1000000).toFixed(2)}M`
                                  : tokenPriceData.liquidityUsd >= 1000
                                  ? `$${(tokenPriceData.liquidityUsd / 1000).toFixed(2)}K`
                                  : `$${tokenPriceData.liquidityUsd.toFixed(2)}`}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-amber-400">
                        ⚠ Price unavailable
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount" className="text-foreground/80">
                    Entry Amount ({tokenInfo.symbol})
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="Amount per participant..."
                    value={entryAmount}
                    onChange={(e) => setEntryAmount(e.target.value)}
                    className="font-mono text-lg bg-background/50"
                    min="0"
                    step="any"
                    data-testid="input-entry-amount"
                  />

                  {/* USD Value and Validation */}
                  {tokenPriceData?.priceUsd !== null && entryAmount && parseFloat(entryAmount) > 0 && (
                    <div className="mt-2">
                      {(() => {
                        const amountNum = parseFloat(entryAmount);
                        const usdValue = amountNum * tokenPriceData?.priceUsd;
                        const minUSD = 5;
                        const isValid = usdValue >= minUSD;
                        const suggestedAmount = minUSD / tokenPriceData?.priceUsd;

                        return (
                          <div className={`p-3 rounded-lg border ${isValid ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-muted-foreground">USD Value:</span>
                              <span className={`text-lg font-mono font-bold ${isValid ? 'text-green-500' : 'text-red-500'}`}>
                                ${usdValue.toFixed(2)}
                              </span>
                            </div>
                            {!isValid && (
                              <div className="mt-2 text-xs text-red-400 space-y-1">
                                <p>⚠ Minimum bet: $5.00 USD</p>
                                <p className="font-mono">
                                  Suggested: {suggestedAmount.toFixed(tokenInfo.decimals)} {tokenInfo.symbol}
                                </p>
                              </div>
                            )}
                            {isValid && (
                              <div className="mt-1 text-xs text-green-500">
                                ✓ Amount meets minimum requirement
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Warning when price is unavailable */}
                  {tokenPriceData?.priceUsd === null && !isLoadingPrice && (
                    <div className="mt-2 p-3 rounded-lg border bg-amber-500/10 border-amber-500/30">
                      <div className="text-sm text-amber-400">
                        ⚠ Price unavailable - unable to enforce $5 minimum
                      </div>
                      <div className="mt-1 text-xs text-amber-400/80">
                        Proceed with caution. Minimum $5 USD equivalent recommended.
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6 flex-1"
              >
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <Label className="text-foreground/80">Max Participants</Label>
                    <span className="font-mono text-primary">{participants}</span>
                  </div>
                  <Slider
                    value={[participants]}
                    onValueChange={([v]) => setParticipants(v)}
                    min={2}
                    max={isFreePool ? 10 : 100}
                    step={1}
                    className="w-full"
                    data-testid="slider-participants"
                  />
                  {isFreePool && (
                    <p className="text-xs text-green-400">
                      Free pools limited to 10 participants (1 creator + 9 free joins)
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <Label className="text-foreground/80">Lock Duration</Label>
                    <span className="font-mono text-primary">{lockDuration} min</span>
                  </div>
                  <Slider
                    value={[lockDuration]}
                    onValueChange={([v]) => setLockDuration(v)}
                    min={1}
                    max={60}
                    step={1}
                    className="w-full"
                    data-testid="slider-lock-duration"
                  />
                </div>

                {/* FREE Pool Toggle (only for sponsor wallet) */}
                {address?.toLowerCase() === SPONSOR_WALLET_PUBKEY.toLowerCase() && (
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label htmlFor="free-pool" className="text-foreground font-medium flex items-center gap-2">
                          <FlaskConical className="w-4 h-4 text-green-400" />
                          FREE Pool (Gasless Join)
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Users join without paying. You sponsor all entries. Max 10 participants (1 creator + 9 free).
                        </p>
                      </div>
                      <Switch
                        id="free-pool"
                        checked={isFreePool}
                        onCheckedChange={(checked) => {
                          setIsFreePool(checked);
                          if (checked && participants > 10) {
                            setParticipants(10);
                          }
                        }}
                        data-testid="switch-free-pool"
                      />
                    </div>
                    {isFreePool && (
                      <div className="text-xs text-green-400 space-y-1">
                        <p>✓ Backend will handle on-chain joins</p>
                        <p>✓ Max 10 participants (1 creator + 9 free joins)</p>
                        <p>✓ Winners receive rewards to their real wallet</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="p-4 rounded-lg bg-muted/50 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Token</span>
                    <span className="font-medium">{tokenInfo?.symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Entry</span>
                    <div className="text-right">
                      <div className="font-medium">{entryAmount} {tokenInfo?.symbol}</div>
                      {tokenPriceData?.priceUsd !== null && (
                        <div className="text-xs text-muted-foreground">
                          ≈ ${(parseFloat(entryAmount) * tokenPriceData?.priceUsd).toFixed(2)} USD
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Pot</span>
                    <div className="text-right">
                      <div className="font-medium text-primary">
                        {(parseFloat(entryAmount) * participants).toLocaleString()} {tokenInfo?.symbol}
                      </div>
                      {tokenPriceData?.priceUsd !== null && (
                        <div className="text-xs text-primary/70">
                          ≈ ${(parseFloat(entryAmount) * participants * tokenPriceData?.priceUsd).toFixed(2)} USD
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 4 && tokenInfo && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4 flex-1"
              >
                <div className="text-center py-6">
                  <motion.div
                    animate={{ 
                      scale: [1, 1.1, 1],
                      rotate: [0, 5, -5, 0],
                    }}
                    transition={{ 
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="inline-block mb-4"
                  >
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary via-purple-500 to-accent flex items-center justify-center">
                      <Rocket className="w-12 h-12 text-white" />
                    </div>
                  </motion.div>
                  
                  <h3 className="text-xl font-bold mb-2">Ready to Create Singularity</h3>
                  <p className="text-muted-foreground text-sm">
                    Your wallet will sign a transaction to create this Black Hole on Solana.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-muted/50 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Token</span>
                    <span className="font-medium">{tokenInfo.symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Entry Amount</span>
                    <div className="text-right">
                      <div className="font-medium">{entryAmount} {tokenInfo.symbol}</div>
                      {tokenPriceData?.priceUsd !== null && (
                        <div className="text-xs text-muted-foreground">
                          ≈ ${(parseFloat(entryAmount) * tokenPriceData?.priceUsd).toFixed(2)} USD
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Participants</span>
                    <span className="font-medium">{participants}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Lock Duration</span>
                    <span className="font-medium">{lockDuration} minutes</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Pot</span>
                    <div className="text-right">
                      <div className="font-medium text-primary">
                        {(parseFloat(entryAmount) * participants).toLocaleString()} {tokenInfo.symbol}
                      </div>
                      {tokenPriceData?.priceUsd !== null && (
                        <div className="text-xs text-primary/70">
                          ≈ ${(parseFloat(entryAmount) * participants * tokenPriceData?.priceUsd).toFixed(2)} USD
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {!isConnected && (
                  <div className="text-center">
                    <Button onClick={connect} variant="outline" data-testid="button-connect-wallet">
                      Connect Wallet First
                    </Button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex justify-between mt-6 relative z-10 gap-2">
          {step > 1 ? (
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={isSubmitting}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={
                (step === 1 && !canProceedStep1) ||
                (step === 2 && !canProceedStep2) ||
                (step === 3 && !canProceedStep3)
              }
              data-testid="button-next"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={isSubmitting || !isConnected || !sdkReady}
              className="bg-gradient-to-r from-primary to-purple-500"
              data-testid="button-initialize-blackhole"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4 mr-2" />
                  Initialize Black Hole
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
