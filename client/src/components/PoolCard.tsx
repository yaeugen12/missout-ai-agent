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
    <div className="absolute right-4 top-1/2 -translate-y-1/2 w-40 h-40 pointer-events-none">
      <svg className="w-full h-full rotate-[-90deg] relative z-10" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="cyberGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f2ff" stopOpacity="1" />
            <stop offset="100%" stopColor="#0066ff" stopOpacity="0.8" />
          </linearGradient>
          <filter id="neonGlow">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        
        {/* Tech Grid Lines */}
        <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(0,242,255,0.05)" strokeWidth="0.5" strokeDasharray="2 4" />
        
        {/* Background Track */}
        <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
        
        {/* Neon Progress Ring */}
        <motion.circle
          cx="50"
          cy="50"
          r="38"
          fill="none"
          stroke="url(#cyberGradient)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          style={{ filter: "url(#neonGlow)" }}
        />
      </svg>
      
      {/* Metrics Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-mono font-black text-cyan-400 leading-none mb-1 drop-shadow-[0_0_8px_rgba(0,242,255,0.5)]">
          {Math.round(percentFull)}%
        </div>
        <div className="text-[8px] text-cyan-400/60 uppercase tracking-widest font-bold">Full</div>
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

        <div className="relative z-10">
          {/* Header Section */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <TokenAvatar 
                logoUrl={tokenMetadata?.logoUrl} 
                symbol={pool.tokenSymbol} 
                accentColor={accentColor}
              />
              <div>
                <h3 className="text-xl font-display font-black text-white leading-none mb-1 tracking-tight">
                  {pool.tokenSymbol}
                </h3>
                <span className={cn(
                  "text-[9px] font-black uppercase px-2 py-0.5 rounded-sm border inline-block tracking-widest",
                  currentStatus.className
                )}>
                  {currentStatus.label}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-end">
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold opacity-60">Entry</div>
                <div className="text-xl font-mono font-black text-white leading-none">
                  {pool.entryAmount.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* Main Visual Section */}
          <div className="bg-black/40 border border-white/5 rounded-2xl p-6 mb-6 relative overflow-hidden backdrop-blur-sm group/main">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover/main:opacity-100 transition-opacity duration-500" />
            
            <div className="flex flex-col gap-4 relative z-10">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-[0.3em] mb-1 font-black opacity-60">Total Prize Pool</div>
                <div className="text-4xl font-mono font-black text-white leading-none tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                  {totalPot.toLocaleString()}
                  <span className="text-lg text-muted-foreground ml-2 font-medium">USD</span>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex flex-col">
                  <div className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1 font-bold">Participants</div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-cyan-400" />
                    <span className="text-lg text-white font-mono font-black leading-none">
                      {participantsCount}<span className="text-muted-foreground/30 mx-1">/</span>{pool.maxParticipants}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Circular Progress (Simplified) */}
            <VortexRing 
              percentFull={percentFull} 
              accentColor={accentColor} 
              poolSize={totalPot}
              symbol={pool.tokenSymbol}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button 
              className="flex-1 bg-white text-black hover:bg-white/90 font-black uppercase tracking-widest text-[11px] h-11 rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.15)] group/btn"
              onClick={handleJoinClick}
              disabled={isJoining || !connected}
            >
              {isJoining ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Enter Void
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover/btn:translate-x-1" />
                </>
              )}
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              className="w-11 h-11 rounded-xl border-white/10 hover:bg-white/5"
              asChild
            >
              <Link href={`/pool/${pool.id}`}>
                <Eye className="w-4 h-4 text-muted-foreground" />
              </Link>
            </Button>
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
