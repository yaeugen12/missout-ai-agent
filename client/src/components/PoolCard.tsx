import { memo, useState, useCallback } from "react";
import { Link } from "wouter";
import { type Pool } from "@shared/schema";
import { cn } from "@/lib/utils";
import { ArrowRight, Copy, Check, ExternalLink, Users, Clock, Heart, Eye, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTokenMetadata } from "@/hooks/use-token-metadata";
import { useCountdown } from "@/hooks/use-countdown";
import { getTokenAccentColor, shortenAddress } from "@/lib/colorUtils";
import { Button } from "@/components/ui/button";
import { DonateModal } from "@/components/DonateModal";
import { useMissoutSDK } from "@/hooks/useMissoutSDK";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";

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

function VortexRing({ percentFull, accentColor, poolSize = 0, symbol = "" }: { percentFull: number; accentColor: string; poolSize?: number; symbol?: string }) {
  const circumference = 2 * Math.PI * 38;
  const strokeDashoffset = circumference - (circumference * percentFull) / 100;
  
  return (
    <div className="absolute -right-10 top-1/2 -translate-y-1/2 w-48 h-48 pointer-events-none overflow-visible">
      <svg className="w-full h-full rotate-[-90deg] relative z-10" viewBox="0 0 100 100">
        <defs>
          <filter id="vortexGlow">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={accentColor} stopOpacity="1" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0.4" />
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
            strokeWidth="0.25"
            className="opacity-[0.03]"
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
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 2.5, ease: "circOut" }}
          style={{ filter: "url(#vortexGlow)" }}
        />

        {/* Orbiting Photon Sphere (Animated Dots) */}
        <motion.circle
          cx="50"
          cy="50"
          r="45"
          fill="transparent"
          stroke={accentColor}
          strokeWidth="1.5"
          strokeDasharray="0.5 15"
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="opacity-40"
        />
        
        {/* Counter-rotating accretion disk layer */}
        <motion.circle
          cx="50"
          cy="50"
          r="32"
          fill="transparent"
          stroke={accentColor}
          strokeWidth="0.5"
          strokeDasharray="2 10"
          animate={{ rotate: -360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          className="opacity-10"
        />
      </svg>
      
      {/* Central Singularity (The Black Hole Core) with Text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className="w-24 h-24 rounded-full relative overflow-hidden flex flex-col items-center justify-center"
          style={{ 
            background: "radial-gradient(circle at center, #000 20%, #050505 50%, transparent 80%)",
          }}
        >
          {/* Pulsing Core Glow */}
          <motion.div 
            className="absolute inset-0 rounded-full z-0"
            animate={{ 
              scale: [0.9, 1.1, 0.9],
              opacity: [0.1, 0.3, 0.1]
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            style={{ background: `radial-gradient(circle at center, ${accentColor.replace("0.8", "0.4")} 0%, transparent 70%)` }}
          />
          
          {/* Pool Size Text Integrated in Core */}
          <div className="relative z-10 flex flex-col items-center justify-center text-center">
            <span className="text-sm font-mono font-black text-white leading-none mb-1">
              {(poolSize ?? 0).toLocaleString()}
            </span>
            <span className="text-[9px] text-primary/60 font-black uppercase tracking-tighter">{symbol}</span>
          </div>

          {/* Inner Singularity Point (subtle backdrop) */}
          <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
            <motion.div 
              className="w-1 h-1 rounded-full bg-white blur-[1px]"
              animate={{ 
                scale: [1, 3, 1],
              }}
              transition={{ duration: 3, repeat: Infinity }}
            />
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
  const isActive = normalizedStatus === "OPEN" || normalizedStatus === "LOCKED";
  const canDonate = normalizedStatus !== "ENDED" && normalizedStatus !== "CANCELLED";
  
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

  const currentStatus = statusConfig[pool.status] || statusConfig.OPEN;

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
      await apiRequest('POST', `/api/pools/${pool.id}/join`, {
        walletAddress: walletAddress,
        txHash: result.tx
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
          "relative h-full bg-black/70 border border-white/10 p-5 overflow-hidden backdrop-blur-xl",
          "transition-all duration-300",
          "hover:border-white/20",
          isActive && "hover:shadow-[0_0_40px_rgba(0,240,255,0.12)]"
        )}
        style={{
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

        <VortexRing percentFull={percentFull} accentColor={accentColor} />

        <div className="relative z-10 pt-2">
          {/* Lock Time Indicator - ABSOLUTELY PROMINENT WITHIN CARD FLOW */}
          {normalizedStatus === "OPEN" && (
            <div className="flex justify-center mb-4">
              <div className="bg-black/80 border-2 border-primary px-4 py-2 rounded-full shadow-[0_0_20px_rgba(0,243,255,0.6)] flex items-center gap-3 animate-pulse">
                <Clock className="w-5 h-5 text-primary" />
                <div className="flex flex-col items-center">
                  <span className="text-sm font-mono font-black text-white leading-none">{pool.lockDuration}m</span>
                  <span className="text-[8px] text-primary font-black uppercase tracking-widest leading-none mt-1">LOCK DURATION</span>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex items-start gap-4 mb-4">
            <TokenAvatar 
              logoUrl={tokenMetadata?.logoUrl} 
              symbol={pool.tokenSymbol} 
              accentColor={accentColor}
            />
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="text-xl font-display font-black text-white group-hover:text-primary transition-colors truncate">
                  {pool.tokenSymbol}
                </h3>
                <span className={cn(
                  "px-2 py-0.5 text-[9px] font-bold uppercase border rounded-sm tracking-tight shrink-0",
                  currentStatus.className
                )}>
                  {currentStatus.label}
                </span>
              </div>
              <p className="text-muted-foreground text-xs truncate mb-1">
                {pool.tokenName}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyPoolAddress}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  data-testid={`button-copy-pool-${pool.id}`}
                >
                  <span className="font-mono">
                    {poolAddress ? shortenAddress(poolAddress) : `#${pool.id}`}
                  </span>
                  <AnimatePresence mode="wait">
                    {copied ? (
                      <motion.span
                        key="check"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                      >
                        <Check className="w-3 h-3 text-green-400" />
                      </motion.span>
                    ) : (
                      <motion.span
                        key="copy"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                      >
                        <Copy className="w-3 h-3" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
                {solscanUrl && (
                  <a
                    href={solscanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground/60 hover:text-primary transition-colors"
                    data-testid={`link-solscan-${pool.id}`}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="mb-4 relative min-h-[120px] flex items-center">
            {/* Entry Box (Full width but limited to make room for vortex) */}
            <div className="bg-white/5 border border-white/5 rounded-lg p-3 backdrop-blur-md w-[55%] z-20">
              <div className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-1 font-bold">Entry</div>
              <div className="text-lg font-mono font-black text-white leading-none mb-1">{pool.entryAmount.toLocaleString()}</div>
              <div className="text-xs text-primary/80 font-bold tracking-tight">{pool.tokenSymbol}</div>
            </div>

            {/* Vortex with integrated Pool Size text */}
            <VortexRing 
              percentFull={percentFull} 
              accentColor={accentColor} 
              poolSize={totalPot}
              symbol={pool.tokenSymbol}
            />
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-white font-mono">
                <span className="text-primary font-bold">{participantsCount}</span>
                <span className="text-muted-foreground">/{pool.maxParticipants}</span>
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">slots</span>
            </div>
            
            <div className="flex items-center gap-4">
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
            {normalizedStatus === "OPEN" && !isFull && (
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
              {canDonate && (
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
                className="flex-1 gap-1.5 font-bold uppercase tracking-wider text-[10px]"
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
