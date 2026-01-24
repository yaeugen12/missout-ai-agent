// BUILD_ID: v7-20260103-2050 - SDK Integration
const BUILD_ID = "v7-20260103-2050";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";
import { useCreatePool } from "@/hooks/use-pools";
import { useMissoutSDK } from "@/hooks/useMissoutSDK";
import { protocolAdapter, TokenInfo } from "@/lib/protocolAdapter";
import { cn } from "@/lib/utils";
import { PublicKey } from "@solana/web3.js";

// Backend DEV wallet authorized for pool operations (unlock, randomness, select_winner, payout)
const DEV_WALLET_PUBKEY = import.meta.env.VITE_DEV_WALLET_PUBKEY || "DCHhAjoVvJ4mUUkbQrsKrPztRhivrNV3fDJEZfHNQ8d3";
import { showTransactionToast } from "@/lib/transaction-toast";
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  Atom,
  Search,
  AlertCircle,
  Check,
  Coins,
  Users,
  Clock,
  Zap,
  CheckCircle2,
  ShoppingCart,
  Settings2,
  RefreshCw,
  FlaskConical
} from "lucide-react";
import { Link } from "wouter";
import { getJupiterQuote, executeJupiterSwap, formatTokenAmount, JupiterQuote } from "@/lib/jupiterSwap";
import { useConnection } from "@solana/wallet-adapter-react";

type Step = 1 | 2 | 3 | 4;

export default function CreatePool() {
  const [step, setStep] = useState<Step>(1);
  const [mintAddress, setMintAddress] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [priceUsd, setPriceUsd] = useState<number | null>(null);
  
  const [participants, setParticipants] = useState(10);
  const [entryAmount, setEntryAmount] = useState<string>("");
  const [lockDuration, setLockDuration] = useState(60);
  const [customDuration, setCustomDuration] = useState("");

  const [solAmount, setSolAmount] = useState<string>("");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [jupiterQuote, setJupiterQuote] = useState<JupiterQuote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);

  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { isConnected, address, connect } = useWallet();
  const { mutate: createPoolBackend, isPending: isCreating } = useCreatePool();
  const { createPool: createPoolOnChain, sdkReady, publicKey, signTransaction } = useMissoutSDK();
  const { connection } = useConnection();

  const currentPrice = priceUsd || 0;
  const entryUsd = parseFloat(entryAmount) * currentPrice;
  // If price is available, enforce $5 minimum. If unavailable, allow proceeding with warning.
  const isValidEntry = priceUsd !== null ? entryUsd >= 5 : true;
  const suggestedAmount = priceUsd ? protocolAdapter.suggestMinEntryAmount(priceUsd) : 0;

  const handleFetchToken = async () => {
    if (!protocolAdapter.isValidSolanaAddress(mintAddress)) {
      toast({ variant: "destructive", title: "Invalid Address", description: "Please enter a valid Solana SPL mint address." });
      return;
    }

    setIsFetching(true);
    try {
      const info = await protocolAdapter.fetchTokenInfo(mintAddress);
      const price = await protocolAdapter.fetchTokenPriceUsd(mintAddress);
      setTokenInfo(info);
      setPriceUsd(price);
      setStep(2);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Fetch Failed", description: e.message });
    } finally {
      setIsFetching(false);
    }
  };

  const handleCreate = async () => {
    if (!isConnected || !address) {
      connect();
      return;
    }

    if (!tokenInfo) {
      return;
    }

    if (!sdkReady || !publicKey) {
      console.error("ABORT: SDK not ready or publicKey null");
      toast({ variant: "destructive", title: "SDK Not Ready", description: "Wallet not fully connected. Please reconnect." });
      return;
    }

    let signature: string | undefined;
    let poolAddress: string | undefined;
    
    try {
      const mintPubkey = new PublicKey(tokenInfo.mint);
      const lockDurationSeconds = lockDuration * 60;

      const sdkResult = await createPoolOnChain({
        mint: mintPubkey,
        amount: entryAmount,
        maxParticipants: participants,
        lockDurationSeconds,
        devWallet: new PublicKey(DEV_WALLET_PUBKEY),
        devFeeBps: 0,
        burnFeeBps: 0,
        treasuryWallet: new PublicKey(DEV_WALLET_PUBKEY),
        treasuryFeeBps: 0,
      });

      signature = sdkResult?.tx;
      poolAddress = sdkResult?.poolId;

      if (signature) {
        showTransactionToast({
          type: "success",
          title: "On-Chain Success",
          description: "Black hole initialized in the void.",
          txHash: signature
        });
      }

    } catch (err: any) {
      console.error("=== SDK_ERROR ===", err);
      showTransactionToast({ 
        type: "error",
        title: "Transaction Failed", 
        description: err.message || "Could not create pool on-chain"
      });
      return;
    }

    if (!signature) {
      console.error("=== GUARD_NO_SIGNATURE ===");
      showTransactionToast({ type: "error", title: "No Signature", description: "Wallet did not return a transaction signature." });
      return;
    }

    if (!poolAddress) {
      console.error("=== GUARD_NO_POOL_PDA ===");
      showTransactionToast({ type: "error", title: "No Pool Address", description: "Could not derive pool address." });
      return;
    }


      createPoolBackend({
        tokenSymbol: tokenInfo.symbol,
        tokenName: tokenInfo.name,
        tokenMint: tokenInfo.mint,
        poolAddress: poolAddress,
        txHash: signature,
        entryAmount: parseFloat(entryAmount),
        minParticipants: 2,
        maxParticipants: participants,
        lockDuration: lockDuration,
        creatorWallet: address,
      }, {
      onSuccess: (pool) => {
        showTransactionToast({ 
          type: "success",
          title: "Black Hole Initialized", 
          description: "The singularity has been created and synced." 
        });

        setLocation(`/pool/${pool.id}`);
      },
      onError: (err) => {
        console.error("=== BACKEND_ERROR ===", err);
        showTransactionToast({ 
          type: "error",
          title: "Backend Sync Failed", 
          description: "Pool created on-chain but not saved to database." 
        });
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && step === 1 && mintAddress && !isFetching) {
      e.preventDefault();
      handleFetchToken();
    }
  };

  const handleGetQuote = async () => {
    if (!tokenInfo || !solAmount || parseFloat(solAmount) <= 0) return;
    
    setIsQuoting(true);
    setJupiterQuote(null);
    
    try {
      const quote = await getJupiterQuote(tokenInfo.mint, parseFloat(solAmount), slippageBps);
      if (quote) {
        setJupiterQuote(quote);
      } else {
        toast({ variant: "destructive", title: "Quote Failed", description: "Could not get swap quote. Token may not have liquidity." });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Quote Error", description: error.message });
    } finally {
      setIsQuoting(false);
    }
  };

  const handleSwap = async () => {
    if (!jupiterQuote || !publicKey || !signTransaction || !connection) {
      toast({ variant: "destructive", title: "Wallet Required", description: "Please connect your wallet to swap." });
      return;
    }

    setIsSwapping(true);
    try {
      const result = await executeJupiterSwap(
        jupiterQuote,
        publicKey.toBase58(),
        DEV_WALLET_PUBKEY,
        signTransaction,
        connection
      );
      
      showTransactionToast({ 
        type: "success",
        title: "Swap Successful!", 
        description: `Bought ${formatTokenAmount(result.outputAmount, tokenInfo?.decimals || 9)} ${tokenInfo?.symbol}`,
        txHash: result.signature
      });
      
      setJupiterQuote(null);
      setSolAmount("");
    } catch (error: any) {
      console.error("[Jupiter] Swap error:", error);
      showTransactionToast({ 
        type: "error",
        title: "Swap Failed", 
        description: error.message || "Failed to swap SOL for tokens"
      });
    } finally {
      setIsSwapping(false);
    }
  };

  useEffect(() => {
    if (solAmount && parseFloat(solAmount) > 0 && tokenInfo?.mint) {
      const fetchQuote = async () => {
        setIsQuoting(true);
        try {
          const quote = await getJupiterQuote(tokenInfo.mint, parseFloat(solAmount), slippageBps);
          if (quote) {
            setJupiterQuote(quote);
          }
        } catch (error) {
          console.error("[Jupiter] Quote error:", error);
        } finally {
          setIsQuoting(false);
        }
      };
      
      const debounce = setTimeout(fetchQuote, 500);
      return () => clearTimeout(debounce);
    } else {
      setJupiterQuote(null);
    }
  }, [solAmount, slippageBps, tokenInfo?.mint]);

  const canProceedToStep3 = tokenInfo !== null;
  const canProceedToStep4 = entryAmount && parseFloat(entryAmount) > 0 && isValidEntry;

  return (
    <div className="min-h-screen bg-black bg-grid-pattern">
      <main className="container mx-auto px-4 py-12 max-w-2xl">
        <Link href="/terminal" className="inline-flex items-center text-muted-foreground hover:text-primary mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Pool Terminal
        </Link>

        <div className="bg-zinc-900/50 border border-white/10 p-8 rounded-lg backdrop-blur-md">
          <div className="mb-8 border-b border-white/10 pb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Atom className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-3xl font-display font-bold text-white">INITIALIZE BLACK HOLE</h1>
            </div>
            <p className="text-muted-foreground">Configure parameters for a new MissOut betting pool.</p>
          </div>

          <div className="flex justify-between mb-8">
            {[
              { num: 1, label: "Token", icon: Search },
              { num: 2, label: "Verify", icon: Check },
              { num: 3, label: "Configure", icon: Coins },
              { num: 4, label: "Review", icon: CheckCircle2 },
            ].map(({ num, label, icon: Icon }) => (
              <div key={num} className="flex items-center gap-2">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all",
                  step >= num 
                    ? "bg-primary text-black" 
                    : "bg-white/10 text-white/50"
                )}>
                  {step > num ? <Check className="w-4 h-4" /> : num}
                </div>
                <span className={cn(
                  "text-xs font-tech uppercase tracking-wider hidden sm:inline",
                  step >= num ? "text-primary" : "text-white/50"
                )}>{label}</span>
              </div>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div 
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <Label className="text-[10px] font-tech uppercase tracking-widest text-muted-foreground">
                    SPL Token Mint Address
                  </Label>
                  <div className="relative">
                    <Input 
                      placeholder="Enter token mint address..."
                      value={mintAddress}
                      onChange={(e) => setMintAddress(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="bg-black/50 border-white/10 h-12 pr-12 font-mono text-sm focus:border-primary/50"
                      data-testid="input-mint-address"
                    />
                    <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Supports any SPL token including pump.fun tokens. Fetches metadata via Helius.
                  </p>
                </div>

                <Button 
                  onClick={handleFetchToken}
                  disabled={!mintAddress || isFetching}
                  className="w-full h-12 bg-primary text-black hover:bg-white font-bold"
                  data-testid="button-fetch-token"
                >
                  {isFetching ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Fetching Token Data...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Fetch Token Info
                    </>
                  )}
                </Button>
              </motion.div>
            )}

            {step === 2 && tokenInfo && (
              <motion.div 
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-4 p-4 bg-black/30 rounded-lg border border-white/5">
                  {tokenInfo.logoUrl ? (
                    <img src={tokenInfo.logoUrl} alt={tokenInfo.symbol} className="w-16 h-16 rounded-full" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                      <Coins className="w-8 h-8 text-primary" />
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white">{tokenInfo.name}</h3>
                    <p className="text-primary font-mono">${tokenInfo.symbol}</p>
                    <p className="text-xs text-muted-foreground mt-1">Decimals: {tokenInfo.decimals}</p>
                  </div>
                  <div className="text-right">
                    {priceUsd ? (
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Current Price</div>
                        <div className="text-lg font-mono font-bold text-primary">
                          ${priceUsd.toFixed(Math.max(3, -Math.floor(Math.log10(priceUsd)) + 2))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-amber-400">⚠ Price unavailable</div>
                    )}
                  </div>
                </div>

                {!tokenInfo.metadataFound && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <p className="text-[10px] text-yellow-400 font-tech uppercase tracking-tighter flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Token metadata not found. Using fallback values.
                    </p>
                  </div>
                )}

                <div className="p-4 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-purple-400" />
                      <span className="text-sm font-tech font-bold text-white uppercase tracking-wide">Buy {tokenInfo.symbol} with SOL</span>
                    </div>
                    <button 
                      onClick={() => setShowSlippageSettings(!showSlippageSettings)}
                      className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
                    >
                      <Settings2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>

                  {showSlippageSettings && (
                    <div className="p-3 bg-black/30 rounded-lg space-y-2">
                      <Label className="text-[10px] font-tech uppercase tracking-widest text-muted-foreground">
                        Slippage Tolerance
                      </Label>
                      <div className="flex gap-2">
                        {[50, 100, 200, 500].map((bps) => (
                          <Button
                            key={bps}
                            size="sm"
                            variant="outline"
                            onClick={() => setSlippageBps(bps)}
                            className={cn(
                              "flex-1 h-8 text-[10px] font-mono border-white/5",
                              slippageBps === bps && "bg-purple-500/20 border-purple-500 text-purple-400"
                            )}
                          >
                            {(bps / 100).toFixed(1)}%
                          </Button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <Input
                          type="number"
                          placeholder="Custom %"
                          value={slippageBps / 100}
                          onChange={(e) => setSlippageBps(Math.round(parseFloat(e.target.value || "0") * 100))}
                          className="bg-black/50 border-white/10 h-8 text-xs font-mono w-24"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-[10px] font-tech uppercase tracking-widest text-muted-foreground">
                      You Pay (SOL)
                    </Label>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={solAmount}
                        onChange={(e) => setSolAmount(e.target.value)}
                        className="bg-black/50 border-white/10 h-12 text-xl font-mono focus:border-purple-500/50 pr-16"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {isQuoting && <Loader2 className="w-4 h-4 animate-spin text-purple-400" />}
                        <span className="text-sm font-mono text-muted-foreground">SOL</span>
                      </div>
                    </div>
                  </div>

                  {jupiterQuote && (
                    <div className="p-3 bg-black/40 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-tech uppercase tracking-widest text-muted-foreground">You Receive</span>
                        <button onClick={handleGetQuote} className="p-1 hover:bg-white/10 rounded transition-colors" data-testid="button-refresh-quote">
                          <RefreshCw className={cn("w-3 h-3 text-muted-foreground", isQuoting && "animate-spin")} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xl font-mono font-bold text-white">
                          {formatTokenAmount(jupiterQuote.outAmount, tokenInfo.decimals)}
                        </span>
                        <span className="text-sm font-mono text-purple-400">{tokenInfo.symbol}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Price Impact</span>
                        <span className={parseFloat(jupiterQuote.priceImpactPct) > 1 ? "text-yellow-400" : "text-green-400"}>
                          {parseFloat(jupiterQuote.priceImpactPct).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  )}

                  {!jupiterQuote && solAmount && parseFloat(solAmount) > 0 && !isQuoting && (
                    <Button
                      onClick={handleGetQuote}
                      className="w-full h-10 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/50 font-bold"
                      data-testid="button-get-quote"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Get Swap Quote
                    </Button>
                  )}

                  <Button
                    onClick={handleSwap}
                    disabled={!jupiterQuote || isSwapping || !isConnected}
                    className="w-full h-10 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-bold"
                    data-testid="button-swap-jupiter"
                  >
                    {isSwapping ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Swapping...
                      </>
                    ) : !isConnected ? (
                      "Connect Wallet to Swap"
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        Swap via Jupiter
                      </>
                    )}
                  </Button>

                  <p className="text-[9px] text-muted-foreground text-center">
                    Powered by Jupiter. 0.5% fee goes to platform.
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setStep(1);
                      setTokenInfo(null);
                      setPriceUsd(null);
                      setSolAmount("");
                      setJupiterQuote(null);
                    }}
                    className="flex-1 h-12 border-white/10"
                    data-testid="button-back-step1"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                  <Button 
                    onClick={() => setStep(3)}
                    disabled={!canProceedToStep3}
                    className="flex-1 h-12 bg-primary text-black hover:bg-white font-bold"
                    data-testid="button-proceed-step3"
                  >
                    Configure Pool <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 3 && tokenInfo && (
              <motion.div 
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-[10px] font-tech uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <Users className="w-3 h-3" /> Max Participants (2-20)
                      </Label>
                      <span className="text-primary font-mono font-bold">{participants}</span>
                    </div>
                    <Slider 
                      value={[participants]} 
                      onValueChange={([v]) => setParticipants(v)}
                      min={2} 
                      max={20} 
                      step={1}
                      className="py-4"
                      data-testid="slider-participants"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-tech uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      <Coins className="w-3 h-3" /> Entry Amount ({tokenInfo.symbol})
                    </Label>
                    <div className="relative">
                      <Input 
                        type="number"
                        placeholder="0.00"
                        value={entryAmount}
                        onChange={(e) => setEntryAmount(e.target.value)}
                        className="bg-black/50 border-white/10 h-12 text-xl font-mono focus:border-primary/50"
                        data-testid="input-entry-amount"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground">
                        {priceUsd ? `≈ $${entryUsd.toFixed(2)}` : "Price Unknown"}
                      </div>
                    </div>
                    
                    {/* USD Value Display & Validation */}
                    {priceUsd && entryAmount && parseFloat(entryAmount) > 0 && (
                      <div className={`p-3 rounded-lg border mt-2 ${entryUsd >= 5 ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-tech uppercase tracking-widest text-muted-foreground">USD Value:</span>
                          <span className={`text-lg font-mono font-bold ${entryUsd >= 5 ? 'text-green-500' : 'text-red-500'}`}>
                            ${entryUsd.toFixed(2)}
                          </span>
                        </div>
                        {entryUsd < 5 && (
                          <div className="mt-2 space-y-2">
                            <p className="text-[10px] text-red-400 font-tech uppercase tracking-tighter flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Minimum entry is $5.00 USD
                            </p>
                            <p className="text-[10px] text-red-400 font-mono">
                              Suggested: {suggestedAmount.toFixed(tokenInfo.decimals)} {tokenInfo.symbol}
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-7 text-[9px] border-red-500/30 hover:bg-red-500/20 font-black uppercase tracking-widest text-red-400"
                              onClick={() => setEntryAmount(suggestedAmount.toString())}
                              data-testid="button-use-suggested"
                            >
                              Use Suggested Amount
                            </Button>
                          </div>
                        )}
                        {entryUsd >= 5 && (
                          <div className="mt-1 text-[10px] text-green-500">
                            ✓ Amount meets minimum requirement
                          </div>
                        )}
                      </div>
                    )}

                    {/* Warning when price unavailable */}
                    {!priceUsd && (
                      <div className="mt-2 p-3 rounded-lg border bg-amber-500/10 border-amber-500/30">
                        <div className="text-[10px] text-amber-400 font-tech uppercase flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Price unavailable - unable to enforce $5 minimum
                        </div>
                        <div className="mt-1 text-[9px] text-amber-400/80">
                          Proceed with caution. Minimum $5 USD equivalent recommended.
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-tech uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      <Clock className="w-3 h-3" /> Event Horizon (Lock Duration)
                    </Label>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 5, 15, 30, 60].map((m) => (
                        <Button 
                          key={m}
                          size="sm"
                          variant="outline"
                          onClick={() => setLockDuration(m)}
                          className={cn(
                            "h-8 text-[10px] font-mono border-white/5", 
                            lockDuration === m && "bg-primary/20 border-primary text-primary"
                          )}
                          data-testid={`button-duration-${m}`}
                        >
                          {m}m
                        </Button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <Input 
                        type="number"
                        placeholder="Custom (min)"
                        value={customDuration}
                        onChange={(e) => {
                          setCustomDuration(e.target.value);
                          const val = parseInt(e.target.value);
                          if (val > 0) setLockDuration(val);
                        }}
                        className="bg-black/50 border-white/10 h-8 text-xs font-mono"
                        data-testid="input-custom-duration"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => setStep(2)}
                    className="flex-1 h-12 border-white/10 hover:bg-white/5 uppercase font-black text-xs tracking-widest"
                    data-testid="button-back-step2"
                  >
                    Back
                  </Button>
                  <Button 
                    disabled={!canProceedToStep4}
                    onClick={() => setStep(4)}
                    className="flex-[2] h-12 bg-primary text-black font-black uppercase tracking-widest hover:bg-white transition-all disabled:opacity-50"
                    data-testid="button-proceed-step4"
                  >
                    Review <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 4 && tokenInfo && (
              <motion.div 
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-black/40 border border-white/10 rounded-xl divide-y divide-white/5 overflow-hidden">
                  <div className="p-4 flex justify-between items-center bg-primary/5">
                    <div className="text-[10px] font-tech text-muted-foreground uppercase">Token</div>
                    <div className="text-right font-display font-black text-sm uppercase italic">
                      {tokenInfo.name} <span className="text-primary">({tokenInfo.symbol})</span>
                    </div>
                  </div>
                  <div className="p-4 flex justify-between items-center">
                    <div className="text-[10px] font-tech text-muted-foreground uppercase tracking-widest">Participants</div>
                    <div className="font-mono text-sm font-bold">{participants} Max</div>
                  </div>
                  <div className="p-4 flex justify-between items-center">
                    <div className="text-[10px] font-tech text-muted-foreground uppercase tracking-widest">Entry</div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-black">{entryAmount} {tokenInfo.symbol}</div>
                      <div className="text-[10px] text-primary/70 font-mono">
                        {priceUsd ? `≈ $${entryUsd.toFixed(2)}` : "Price Unknown"}
                      </div>
                    </div>
                  </div>
                  <div className="p-4 flex justify-between items-center">
                    <div className="text-[10px] font-tech text-muted-foreground uppercase tracking-widest">Horizon</div>
                    <div className="font-mono text-sm font-bold">{lockDuration} Minutes</div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => setStep(3)}
                    className="flex-1 h-12 border-white/10 hover:bg-white/5 uppercase font-black text-xs tracking-widest"
                    data-testid="button-back-step3"
                  >
                    Back
                  </Button>
                  {isConnected ? (
                    <Button 
                      onClick={handleCreate}
                      disabled={isCreating}
                      className="flex-[2] h-12 bg-primary text-black font-black uppercase tracking-widest hover:bg-white transition-all shadow-[0_0_20px_rgba(0,240,255,0.3)]"
                      data-testid="button-create-pool"
                    >
                      {isCreating ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <>
                          Initialize Black Hole
                          <Zap className="ml-2 w-4 h-4 fill-current" />
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button 
                      onClick={connect}
                      className="flex-[2] h-12 bg-white/10 text-white hover:bg-white/20 border border-white/10 font-bold"
                      data-testid="button-connect-wallet"
                    >
                      Connect Wallet to Initialize
                    </Button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
