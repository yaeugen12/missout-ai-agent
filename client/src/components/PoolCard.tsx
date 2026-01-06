import { memo, useState, useCallback } from "react";
import { Link } from "wouter";
import { type Pool } from "@shared/schema";
import { cn } from "@/lib/utils";
import { ArrowRight, Copy, Check, ExternalLink, Users, Clock, Heart, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTokenMetadata } from "@/hooks/use-token-metadata";
import { useCountdown } from "@/hooks/use-countdown";
import { getTokenAccentColor, shortenAddress } from "@/lib/colorUtils";
import { Button } from "@/components/ui/button";
import { DonateModal } from "@/components/DonateModal";

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

function VortexRing({ percentFull, accentColor }: { percentFull: number; accentColor: string }) {
  const circumference = 2 * Math.PI * 38;
  const strokeDashoffset = circumference - (circumference * percentFull) / 100;
  
  return (
    <div className="absolute -right-4 top-1/2 -translate-y-1/2 w-28 h-28 opacity-60">
      <svg className="w-full h-full rotate-[-90deg]" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="38"
          fill="transparent"
          stroke="currentColor"
          strokeWidth="1"
          className="text-white/5"
        />
        <circle
          cx="50"
          cy="50"
          r="32"
          fill="transparent"
          stroke="currentColor"
          strokeWidth="0.5"
          className="text-white/5"
        />
        <motion.circle
          cx="50"
          cy="50"
          r="38"
          fill="transparent"
          stroke={accentColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 8px ${accentColor})` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className="w-12 h-12 rounded-full"
          style={{ 
            background: `radial-gradient(circle at center, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 50%, transparent 100%)`,
            boxShadow: `inset 0 0 15px rgba(0,0,0,1), 0 0 20px ${accentColor.replace("0.8", "0.2")}`
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div 
              className="w-1.5 h-1.5 rounded-full bg-white"
              animate={{ 
                scale: [1, 1.5, 1],
                opacity: [0.5, 1, 0.5]
              }}
              transition={{ duration: 2, repeat: Infinity }}
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
  const tokenMetadata = useTokenMetadata(pool.tokenSymbol);
  const accentColor = getTokenAccentColor(pool.tokenSymbol);
  
  const participantsCount = pool.participantsCount ?? 0;
  const totalPot = pool.totalPot ?? 0;
  
  const percentFull = Math.min(100, (participantsCount / pool.maxParticipants) * 100);
  const isFull = percentFull >= 100;
  const isActive = pool.status === "OPEN" || pool.status === "LOCKED";
  const canDonate = pool.status !== "ENDED" && pool.status !== "CANCELLED";
  
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

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    // If user clicked inside the DonateModal (which is a child of Link in the DOM)
    // we want to prevent navigation. However, Radix Dialog uses Portals, 
    // so this is mostly for the button click itself.
    if (donateModalOpen) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, [donateModalOpen]);

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

        <div className="relative z-10">
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

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white/5 rounded-md p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Entry</div>
              <div className="text-lg font-mono font-bold text-white">{pool.entryAmount.toLocaleString()}</div>
              <div className="text-xs text-primary/80 font-medium">{pool.tokenSymbol}</div>
            </div>
            <div className="bg-white/5 rounded-md p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Pool Size</div>
              <div className="text-lg font-mono font-bold text-white">{totalPot.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">{pool.tokenSymbol}</div>
            </div>
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
              {pool.status === "OPEN" && (
                <div className="flex items-center gap-1.5 bg-primary/5 px-2.5 py-1 rounded-sm border border-primary/20 shadow-[0_0_10px_rgba(0,243,255,0.05)]">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-mono font-black text-white leading-none">{pool.lockDuration}m</span>
                    <span className="text-[7px] text-primary/70 uppercase font-bold tracking-tighter leading-none mt-0.5">lock time</span>
                  </div>
                </div>
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

          <div className="flex items-center gap-2">
            {pool.status === "OPEN" && !isFull && (
              <Button 
                className="flex-1 gap-1.5 font-bold uppercase tracking-wider text-[10px] group/btn"
                size="sm"
                data-testid={`button-join-pool-${pool.id}`}
              >
                Get Pulled In
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-0.5" />
              </Button>
            )}
            {canDonate && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDonateClick}
                className="gap-1.5 font-bold uppercase tracking-wider text-[10px]"
                data-testid={`button-donate-pool-${pool.id}`}
              >
                <Heart className="w-3.5 h-3.5" />
                Donate
              </Button>
            )}
            <Button 
              variant="outline" 
              className="gap-1.5 font-bold uppercase tracking-wider text-[10px]"
              size="sm"
              data-testid={`button-view-pool-${pool.id}`}
            >
              <Eye className="w-3.5 h-3.5" />
              Open
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
