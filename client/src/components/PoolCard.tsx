import { memo, useState, useCallback } from "react";
import { Link } from "wouter";
import { type Pool } from "@/types/shared";
import { cn } from "@/lib/utils";
import { ArrowRight, Copy, Check, ExternalLink, Users, Heart, Eye, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTokenMetadata } from "@/hooks/use-token-metadata";
import { getTokenAccentColor, shortenAddress } from "@/lib/colorUtils";
import { Button } from "@/components/ui/button";
import { DonateModal } from "@/components/DonateModal";
import { useMissoutSDK } from "@/hooks/useMissoutSDK";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";

interface PoolCardProps {
  pool: Pool;
}

function TokenAvatar({ 
  logoUrl, 
  symbol 
}: { 
  logoUrl?: string; 
  symbol: string;
}) {
  const [imgError, setImgError] = useState(false);
  
  if (logoUrl && !imgError) {
    return (
      <div className="relative w-14 h-14 rounded-full overflow-hidden ring-2 ring-amber-500/50">
        <img
          src={logoUrl}
          alt={symbol}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }
  
  return (
    <div 
      className="relative w-14 h-14 rounded-full flex items-center justify-center ring-2 ring-amber-500/50"
      style={{ 
        background: "linear-gradient(135deg, #D4A574 0%, #8B6914 50%, #5C4A1F 100%)"
      }}
    >
      <span className="text-lg font-bold text-white">{symbol.slice(0, 2)}</span>
    </div>
  );
}

function ProgressRing({ percentFull, poolSize }: { percentFull: number; poolSize: number }) {
  const circumference = 2 * Math.PI * 42;
  const strokeDashoffset = circumference - (circumference * percentFull) / 100;
  
  return (
    <div className="relative w-28 h-28">
      <svg className="w-full h-full rotate-[-90deg]" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFD700" />
            <stop offset="50%" stopColor="#DAA520" />
            <stop offset="100%" stopColor="#B8860B" />
          </linearGradient>
          <filter id="goldGlow">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="transparent"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="4"
        />
        
        <motion.circle
          cx="50"
          cy="50"
          r="42"
          fill="transparent"
          stroke="url(#goldGradient)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          style={{ filter: "url(#goldGlow)", }}
        />
      </svg>
      
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">{poolSize.toLocaleString()}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Pool Size</span>
      </div>
    </div>
  );
}

function PoolCardComponent({ pool }: PoolCardProps) {
  const [copied, setCopied] = useState(false);
  const [donateModalOpen, setDonateModalOpen] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const tokenMetadata = useTokenMetadata(pool.tokenSymbol);
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
  const canDonate = normalizedStatus !== "ENDED" && normalizedStatus !== "CANCELLED" && normalizedStatus !== "WINNERSELECTED" && normalizedStatus !== "WINNER";
  
  const poolAddress = pool.poolAddress;
  const solscanUrl = poolAddress ? `https://solscan.io/account/${poolAddress}` : null;

  const statusConfig: Record<string, { label: string; className: string }> = {
    OPEN: { label: "OPEN", className: "text-primary border-primary/50 bg-primary/10" },
    LOCKED: { label: "LOCKED", className: "text-yellow-400 border-yellow-400/50 bg-yellow-400/10" },
    WINNER: { label: "ENDED", className: "text-green-400 border-green-400/50 bg-green-400/10" },
    WINNERSELECTED: { label: "ENDED", className: "text-green-400 border-green-400/50 bg-green-400/10" },
    ENDED: { label: "ENDED", className: "text-gray-500 border-gray-500/50 bg-gray-500/10" },
    CANCELLED: { label: "REFUND", className: "text-red-400 border-red-400/50 bg-red-400/10" },
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
      const result = await sdkJoinPool({
        poolId: poolAddress || pool.id.toString(),
        amount: pool.entryAmount.toString(),
      });

      if (!result?.tx) {
        throw new Error("No transaction signature returned from wallet");
      }

      await apiFetch(`/api/pools/${pool.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: walletAddress,
          txHash: result.tx
        }),
        credentials: 'include'
      });

      toast({ title: "Success", description: "Successfully joined the void!" });

      queryClient.invalidateQueries({ queryKey: ["/api/pools"] });
      queryClient.invalidateQueries({ queryKey: [`/api/pools/${pool.id}`] });

    } catch (err: any) {
      console.error("Join error:", err);
      toast({ variant: "destructive", title: "Error", description: err.message || "Failed to join pool" });
    } finally {
      setIsJoining(false);
    }
  }, [isJoining, connected, walletAddress, sdkJoinPool, pool, poolAddress, toast, queryClient]);

  return (
    <Link href={`/pool/${pool.id}`} className="block group" data-testid={`card-pool-${pool.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -4 }}
        transition={{ duration: 0.3 }}
        className="relative bg-zinc-900/90 border border-cyan-500/20 rounded-2xl p-5 overflow-hidden backdrop-blur-xl"
        style={{
          boxShadow: "0 0 30px rgba(0, 200, 255, 0.05), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <TokenAvatar 
              logoUrl={tokenMetadata?.logoUrl} 
              symbol={pool.tokenSymbol}
            />
            <div>
              <h3 className="text-xl font-bold text-white">{pool.tokenSymbol}</h3>
              <p className="text-sm text-muted-foreground">{pool.tokenName || "Unknown Token"}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <button
                  onClick={handleCopyPoolAddress}
                  className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors font-mono"
                  data-testid={`button-copy-pool-${pool.id}`}
                >
                  {poolAddress ? shortenAddress(poolAddress) : `#${pool.id}`}
                  {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                </button>
                {solscanUrl && (
                  <a
                    href={solscanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground/60 hover:text-primary transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-center bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-2">
            <span className="text-lg font-bold text-cyan-400">{pool.lockDuration}m</span>
            <span className="text-[8px] text-cyan-400/70 uppercase tracking-wider">Lock Duration</span>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="bg-zinc-800/50 border border-white/5 rounded-xl p-4">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Entry</div>
            <div className="text-2xl font-bold text-amber-200">{pool.entryAmount.toLocaleString()}</div>
          </div>
          
          <ProgressRing percentFull={percentFull} poolSize={totalPot} />
        </div>

        <div className="flex items-center gap-2 mb-5">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-white font-mono">
            <span className="text-primary font-bold">{participantsCount}</span>
            <span className="text-muted-foreground">/{pool.maxParticipants}</span>
          </span>
          <span className="text-xs text-muted-foreground">slots</span>
        </div>

        {normalizedStatus === "OPEN" && !isFull && (
          <Button 
            className="w-full h-12 text-sm font-bold uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 text-black rounded-xl mb-3"
            onClick={handleJoinClick}
            disabled={isJoining || !connected}
            data-testid={`button-join-pool-${pool.id}`}
          >
            {isJoining ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                GET PULLED IN
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        )}

        <div className="flex gap-2">
          {canDonate && (
            <Button
              variant="outline"
              className="flex-1 h-10 border-white/10 hover:border-white/20 hover:bg-white/5 rounded-xl"
              onClick={handleDonateClick}
              data-testid={`button-donate-pool-${pool.id}`}
            >
              <Heart className="w-4 h-4 mr-2 text-pink-400" />
              <span className="text-sm">DONATE</span>
            </Button>
          )}
          
          <Button
            variant="outline"
            className={cn(
              "flex-1 h-10 border-white/10 hover:border-white/20 hover:bg-white/5 rounded-xl",
              currentStatus.className
            )}
            data-testid={`button-status-pool-${pool.id}`}
          >
            <Eye className="w-4 h-4 mr-2" />
            <span className="text-sm">{currentStatus.label}</span>
          </Button>
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
