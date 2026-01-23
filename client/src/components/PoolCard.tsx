import { memo, useState, useCallback } from "react";
import { Link } from "wouter";
import { type Pool } from "@/types/shared";
import { cn } from "@/lib/utils";
import { ArrowRight, Copy, Check, ExternalLink, Users, Clock, Heart, Eye, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTokenMetadata } from "@/hooks/use-token-metadata";
import { useCountdown } from "@/hooks/use-countdown";
import { getTokenAccentColor, shortenAddress } from "@/lib/colorUtils";
import { Button } from "@/components/ui/button";
import { DonateModal } from "@/components/DonateModal";
import { useMissoutSDK } from "@/hooks/useMissoutSDK";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";

import poolCardBg from "../assets/images/pool-card-bg.png";

interface PoolCardProps {
  pool: Pool;
}

function TokenAvatar({ 
  logoUrl, 
  symbol, 
  accentColor 
}: { 
  logoUrl?: string; 
  symbol: string; 
  accentColor: string;
}) {
  const [imgError, setImgError] = useState(false);
  
  if (logoUrl && !imgError) {
    return (
      <div className="relative w-14 h-14 rounded-full overflow-hidden ring-2 ring-white/10">
        <img
          src={logoUrl}
          alt={symbol}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
        <div 
          className="absolute inset-0 opacity-30"
          style={{ background: `radial-gradient(circle at center, transparent 40%, ${accentColor} 100%)` }}
        />
      </div>
    );
  }
  
  return (
    <div 
      className="relative w-14 h-14 rounded-full flex items-center justify-center ring-2 ring-white/10"
      style={{ 
        background: `radial-gradient(circle at 30% 30%, ${accentColor.replace("0.8", "0.4")} 0%, rgba(0,0,0,0.9) 70%)` 
      }}
    >
      <span className="text-lg font-bold text-white/90">{symbol.slice(0, 2)}</span>
      <div className="absolute inset-0 rounded-full animate-pulse opacity-30" 
        style={{ boxShadow: `inset 0 0 20px ${accentColor}` }} 
      />
    </div>
  );
}

function VolatilityBadge({ initialPrice, currentPrice }: { initialPrice: number; currentPrice: number }) {
  const percent = ((currentPrice - initialPrice) / initialPrice) * 100;
  const isUp = percent > 1;
  const isDown = percent < -1;
  
  const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const colorClass = isUp ? "text-green-400" : isDown ? "text-red-400" : "text-cyan-400";
  const bgClass = isUp ? "bg-green-500/10 border-green-500/20" : isDown ? "bg-red-500/10 border-red-500/20" : "bg-cyan-500/10 border-cyan-500/20";
  
  return (
    <div className={cn("flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono font-bold", bgClass, colorClass)}>
      <TrendIcon className="w-3 h-3" />
      <span>{percent >= 0 ? "+" : ""}{percent.toFixed(1)}%</span>
    </div>
  );
}

function VortexRing({ percentFull, accentColor, poolSize = 0, symbol = "" }: { percentFull: number; accentColor: string; poolSize?: number; symbol?: string }) {
  const circumference = 2 * Math.PI * 38;
  const strokeDashoffset = circumference - (circumference * percentFull) / 100;
  
  return (
    <div className="absolute -right-8 top-1/2 -translate-y-1/2 w-48 h-48 pointer-events-none overflow-visible">
      <svg className="w-full h-full rotate-[-90deg] relative z-10" viewBox="0 0 100 100">
        <defs>
          <filter id="vortexGlow">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFD700" stopOpacity="1" />
            <stop offset="50%" stopColor="#FFFACD" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#B8860B" stopOpacity="0.8" />
          </linearGradient>
        </defs>
        
        {/* Ambient Cosmic Dust (Static Rings) */}
        {[30, 34, 38, 42].map((r, i) => (
          <circle
            key={r}
            cx="50"
            cy="50"
            r={r}
            fill="transparent"
            stroke="white"
            strokeWidth="0.5"
            className="opacity-[0.08]"
            strokeDasharray="1 6"
            style={{ transformOrigin: "center" }}
          />
        ))}
        
        {/* Main Event Horizon Progress Ring */}
        <motion.circle
          cx="50"
          cy="50"
          r="38"
          fill="transparent"
          stroke="url(#ringGradient)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 2.5, ease: "circOut" }}
          style={{ filter: "url(#vortexGlow)" }}
        />

        {/* Outer Glow Ring */}
        <circle
          cx="50"
          cy="50"
          r="38"
          fill="transparent"
          stroke="white"
          strokeWidth="1"
          className="opacity-20"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      
      {/* Central Singularity (The Black Hole Core) with Text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className="w-28 h-28 rounded-full relative overflow-hidden flex flex-col items-center justify-center"
          style={{ 
            background: "radial-gradient(circle at center, #000 40%, #0a0a0a 70%, transparent 100%)",
            boxShadow: "inset 0 0 40px rgba(0,0,0,1), 0 0 20px rgba(255,215,0,0.1)"
          }}
        >
          {/* Pulsing Core Glow */}
          <motion.div 
            className="absolute inset-0 rounded-full z-0"
            animate={{ 
              scale: [0.9, 1.1, 0.9],
              opacity: [0.15, 0.35, 0.15]
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            style={{ background: `radial-gradient(circle at center, rgba(255, 215, 0, 0.2) 0%, transparent 75%)` }}
          />
          
          {/* Pool Size Text Integrated in Core */}
          <div className="relative z-10 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-mono font-black text-amber-100 leading-none mb-1 drop-shadow-[0_0_8px_rgba(255,215,0,0.5)]">
              {(poolSize ?? 0).toLocaleString()}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-black leading-none opacity-90">POOL SIZE</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CountdownRing({ 
  endTime, 
  lockDuration, 
  accentColor,
  status 
}: { 
  endTime: Date | null; 
  lockDuration: number;
  accentColor: string;
  status: string;
}) {
  const countdown = useCountdown(endTime, lockDuration);
  
  if (status !== "LOCKED" && status !== "UNLOCKING") {
    return null;
  }
  
  const circumference = 2 * Math.PI * 18;
  const strokeDashoffset = circumference - (circumference * countdown.percentRemaining) / 100;
  
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-10 h-10">
        <svg className="w-full h-full rotate-[-90deg]" viewBox="0 0 44 44">
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="transparent"
            stroke="currentColor"
            strokeWidth="2"
            className="text-white/10"
          />
          <motion.circle
            cx="22"
            cy="22"
            r="18"
            fill="transparent"
            stroke={accentColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.5 }}
            style={{ filter: `drop-shadow(0 0 4px ${accentColor})` }}
          />
        </svg>
        <Clock className="absolute inset-0 m-auto w-4 h-4 text-white/70" />
      </div>
      <div className="text-right">
        <div className="text-sm font-mono font-bold text-white">{countdown.formatted}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">remaining</div>
      </div>
    </div>
  );
}

function CountdownOverlay({ 
  endTime, 
  lockDuration 
}: { 
  endTime: Date | null; 
  lockDuration: number;
}) {
  const countdown = useCountdown(endTime, lockDuration);
  return (
    <div className="bg-black/80 border-2 border-yellow-400 px-6 py-4 rounded-xl shadow-[0_0_30px_rgba(250,204,21,0.4)] flex flex-col items-center gap-2 transform scale-110">
      <Clock className="w-8 h-8 text-yellow-400 animate-pulse" />
      <div className="flex flex-col items-center">
        <span className="text-3xl font-mono font-black text-white leading-none">
          {countdown.formatted}
        </span>
        <span className="text-[10px] text-yellow-400 font-black uppercase tracking-[0.2em] mt-1">EVENT HORIZON</span>
      </div>
    </div>
  );
}

function PoolCardComponent({ pool }: PoolCardProps) {
  const [copied, setCopied] = useState(false);
  const [donateModalOpen, setDonateModalOpen] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const tokenMetadata = useTokenMetadata(pool.tokenSymbol);
  const accentColor = getTokenAccentColor(pool.tokenSymbol);
  const { connected, joinPool: sdkJoinPool } = useMissoutSDK();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58();
  
  const participantsCount = pool.participantsCount ?? 0;
  const totalPot = pool.totalPot ?? 0;
  
  const percentFull = Math.min(100, (participantsCount / pool.maxParticipants) * 100);
  const isFull = percentFull >= 100;
  const normalizedStatus = pool.status.toUpperCase();
  const isActive = normalizedStatus === "OPEN" || normalizedStatus === "LOCKED" || normalizedStatus === "UNLOCKING" || normalizedStatus === "RANDOMNESS" || normalizedStatus === "RANDOMNESSCOMMITTED" || normalizedStatus === "RANDOMNESSREVEALED";
  const isLocked = normalizedStatus === "LOCKED" || normalizedStatus === "UNLOCKING" || normalizedStatus === "RANDOMNESS" || normalizedStatus === "RANDOMNESSCOMMITTED" || normalizedStatus === "RANDOMNESSREVEALED";
  const canDonate = normalizedStatus !== "ENDED" && normalizedStatus !== "CANCELLED" && normalizedStatus !== "WINNERSELECTED" && normalizedStatus !== "WINNER";
  
  const lockEndTime = pool.lockTime 
    ? new Date(new Date(pool.lockTime).getTime() + pool.lockDuration * 60 * 1000)
    : null;

  const poolAddress = pool.poolAddress;
  const solscanUrl = poolAddress ? `https://solscan.io/account/${poolAddress}` : null;

  const statusConfig: Record<string, { label: string; className: string }> = {
    OPEN: {
      label: "OPEN",
      className: "text-primary border-primary/50 bg-primary/10"
    },
    LOCKED: {
      label: "HORIZON",
      className: "text-yellow-400 border-yellow-400/50 bg-yellow-400/10"
    },
    UNLOCKING: {
      label: "UNLOCKING",
      className: "text-orange-400 border-orange-400/50 bg-orange-400/10"
    },
    RANDOMNESS: {
      label: "DRAWING",
      className: "text-purple-400 border-purple-400/50 bg-purple-400/10"
    },
    RANDOMNESSCOMMITTED: {
      label: "DRAWING",
      className: "text-purple-400 border-purple-400/50 bg-purple-400/10"
    },
    RANDOMNESSREVEALED: {
      label: "DRAWING",
      className: "text-purple-400 border-purple-400/50 bg-purple-400/10"
    },
    WINNERSELECTED: {
      label: "ESCAPED",
      className: "text-green-400 border-green-400/50 bg-green-400/10"
    },
    WINNER: {
      label: "ESCAPED",
      className: "text-green-400 border-green-400/50 bg-green-400/10"
    },
    ENDED: {
      label: "COLLAPSED",
      className: "text-gray-500 border-gray-500/50 bg-gray-500/10"
    },
    CANCELLED: {
      label: "REFUND",
      className: "text-red-400 border-red-400/50 bg-red-400/10"
    },
  };

  const currentStatus = statusConfig[normalizedStatus] || statusConfig.OPEN;

  const handleCopyPoolAddress = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const copyValue = poolAddress || `pool-${pool.id}`;
    navigator.clipboard.writeText(copyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [poolAddress, pool.id]);

  const handleDonateClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDonateModalOpen(true);
  }, []);

  const handleJoinClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isJoining || !connected || !walletAddress) {
      if (!connected) toast({ title: "Wallet not connected", description: "Please connect your wallet to join" });
      return;
    }
    
    setIsJoining(true);
    try {
      // 1. SDK Join (On-chain)
      const result = await sdkJoinPool({
        poolId: poolAddress || pool.id.toString(),
        amount: pool.entryAmount.toString(),
      });

      if (!result?.tx) {
        throw new Error("No transaction signature returned from wallet");
      }

      // 2. Notify Backend
      await apiFetch(`/api/pools/${pool.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: walletAddress,
          txHash: result.tx
        }),
        credentials: 'include'
      });

      toast({
        title: "Success",
        description: "Successfully joined the void!",
      });

      // 3. Refresh Data
      queryClient.invalidateQueries({ queryKey: ["/api/pools"] });
      queryClient.invalidateQueries({ queryKey: [`/api/pools/${pool.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile", walletAddress] });

    } catch (err: any) {
      console.error("Join error:", err);
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || "Failed to join pool",
      });
    } finally {
      setIsJoining(false);
    }
  }, [isJoining, connected, walletAddress, sdkJoinPool, pool, poolAddress, toast, queryClient]);

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    if (donateModalOpen || isJoining) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, [donateModalOpen, isJoining]);

  return (
    <Link href={`/pool/${pool.id}`} className="block group" data-testid={`card-pool-${pool.id}`} onClick={handleCardClick}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -6, scale: 1.01 }}
        transition={{ duration: 0.3 }}
        className={cn(
          "relative h-full border border-white/10 p-5 overflow-hidden backdrop-blur-xl rounded-xl",
          "transition-all duration-300",
          "hover:border-white/20",
          isActive && "hover:shadow-[0_0_40px_rgba(0,240,255,0.12)]"
        )}
        style={{
          backgroundImage: `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.8)), url(${poolCardBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          boxShadow: isActive ? `0 0 30px ${accentColor.replace("0.8", "0.08")}` : undefined,
        }}
      >
        <motion.div 
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          style={{
            background: `radial-gradient(circle at 80% 50%, ${accentColor.replace("0.8", "0.08")} 0%, transparent 50%)`,
          }}
        />

        <div className="relative z-10 pt-2">
          {/* Status Badge - Top Left */}
          <div className="absolute top-0 left-0 flex flex-col gap-2">
            <span className={cn(
              "px-3 py-1 text-[10px] font-black uppercase border rounded-full tracking-widest backdrop-blur-md shadow-lg",
              currentStatus.className
            )}>
              {currentStatus.label}
            </span>
          </div>

          {/* Locked/Timer Overlay */}
          {isLocked && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute -inset-5 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[4px] pointer-events-none rounded-xl"
            >
              <CountdownOverlay endTime={lockEndTime} lockDuration={pool.lockDuration} />
            </motion.div>
          )}

          <div className="flex items-start justify-between gap-4 mb-6 pt-8">
            <div className="flex items-center gap-4">
              <TokenAvatar 
                logoUrl={tokenMetadata?.logoUrl} 
                symbol={pool.tokenSymbol} 
                accentColor={accentColor}
              />
              <div className="flex flex-col">
                <h3 className="text-2xl font-display font-black text-white group-hover:text-primary transition-all duration-300 tracking-tight">
                  {pool.tokenSymbol}
                </h3>
                <p className="text-muted-foreground text-xs font-medium opacity-70">
                  {pool.tokenName}
                </p>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyPoolAddress}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                  title="Copy Pool Address"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
                {solscanUrl && (
                  <a
                    href={solscanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-primary/20 hover:border-primary/40 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="mb-8 relative min-h-[140px] flex items-center">
            {/* Entry Box - Glassmorphism Style */}
            <div className="bg-gradient-to-br from-zinc-800/90 to-black/90 border border-white/10 rounded-2xl p-5 backdrop-blur-xl w-[60%] z-20 shadow-[0_8px_32px_rgba(0,0,0,0.5)] relative overflow-hidden group/entry">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 to-transparent opacity-0 group-hover/entry:opacity-100 transition-opacity duration-500" />
              <div className="text-[11px] text-muted-foreground uppercase tracking-[0.3em] mb-2 font-black opacity-60">Entry Amount</div>
              <div className="text-3xl font-mono font-black text-amber-200 leading-none tracking-tighter drop-shadow-[0_0_12px_rgba(251,191,36,0.3)]">
                {pool.entryAmount.toLocaleString()}
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[9px] text-primary/80 font-bold uppercase tracking-widest">Active Pool</span>
              </div>
            </div>

            {/* Vortex with integrated Pool Size text */}
            <VortexRing 
              percentFull={percentFull} 
              accentColor={accentColor} 
              poolSize={totalPot}
              symbol={pool.tokenSymbol}
            />
          </div>

          <div className="flex items-center justify-between mb-5 px-1">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg text-white font-mono leading-none font-black">
                  {participantsCount}<span className="text-muted-foreground/50 text-sm mx-0.5">/</span>{pool.maxParticipants}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold">Participants</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {pool.initialPriceUsd && pool.currentPriceUsd && (
                <VolatilityBadge 
                  initialPrice={pool.initialPriceUsd} 
                  currentPrice={pool.currentPriceUsd} 
                />
              )}
            </div>
          </div>
            
            <div className="flex items-center gap-3">
              {/* Mini Volatility Indicator */}
              {pool.initialPriceUsd && pool.currentPriceUsd && (
                <VolatilityBadge 
                  initialPrice={pool.initialPriceUsd} 
                  currentPrice={pool.currentPriceUsd} 
                />
              )}
              
              <CountdownRing 
                endTime={lockEndTime}
                lockDuration={pool.lockDuration}
                accentColor={accentColor}
                status={pool.status}
              />
            </div>
          </div>

          <div className="flex gap-1.5 mb-5">
            {[...Array(Math.min(pool.maxParticipants, 20))].map((_, i) => (
              <motion.div
                key={i}
                initial={false}
                animate={{
                  backgroundColor: i < participantsCount 
                    ? accentColor 
                    : "rgba(255, 255, 255, 0.05)",
                  boxShadow: i < participantsCount 
                    ? `0 0 8px ${accentColor}` 
                    : "none",
                }}
                transition={{ duration: 0.4, delay: i * 0.02 }}
                className="h-1 flex-1 rounded-full"
                style={{ maxWidth: "20px" }}
              />
            ))}
            {pool.maxParticipants > 20 && (
              <span className="text-[9px] text-muted-foreground self-center">
                +{pool.maxParticipants - 20}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {normalizedStatus === "OPEN" && !isFull && !isLocked && (
              <Button 
                className="flex-1 min-w-[120px] gap-1.5 font-bold uppercase tracking-wider text-[10px] group/btn"
                size="sm"
                onClick={handleJoinClick}
                disabled={isJoining || !connected}
                data-testid={`button-join-pool-${pool.id}`}
              >
                {isJoining ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    Get Pulled In
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-0.5" />
                  </>
                )}
              </Button>
            )}
            <div className="flex gap-2 w-full sm:w-auto flex-1">
              {canDonate && !isLocked && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDonateClick}
                  className="flex-1 gap-1.5 font-bold uppercase tracking-wider text-[10px]"
                  data-testid={`button-donate-pool-${pool.id}`}
                >
                  <Heart className="w-3.5 h-3.5" />
                  Donate
                </Button>
              )}
              <Button 
                variant="outline" 
                className={cn(
                  "flex-1 gap-1.5 font-bold uppercase tracking-wider text-[10px]",
                  isLocked && "w-full z-[60] pointer-events-auto bg-black/60 border-yellow-400/50 hover:bg-yellow-400/10"
                )}
                size="sm"
                data-testid={`button-view-pool-${pool.id}`}
              >
                <Eye className="w-3.5 h-3.5" />
                Open
              </Button>
            </div>
          </div>
        </div>

        <DonateModal
          pool={pool}
          open={donateModalOpen}
          onOpenChange={setDonateModalOpen}
        />
      </motion.div>
    </Link>
  );
}

export const PoolCard = memo(PoolCardComponent);
