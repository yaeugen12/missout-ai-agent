import { memo, useState, useCallback } from "react";
import { Link } from "wouter";
import { type Pool } from "@/types/shared";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Copy,
  Check,
  ExternalLink,
  Users,
  Clock,
  Heart,
  Eye,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTokenMetadata } from "@/hooks/use-token-metadata";
import { useCountdown } from "@/hooks/use-countdown";
import { getTokenAccentColor, shortenAddress } from "@/lib/colorUtils";
import { Button } from "@/components/ui/button";
import { DonateModal } from "@/components/DonateModal";
import { useMissoutSDK } from "@/hooks/useMissoutSDK";
import { useToast } from "@/hooks/use-toast";
import { showTransactionToast } from "@/lib/transaction-toast";
import { apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";

// Format large numbers compactly (1.48M instead of 1,487,210)
function formatCompactNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + 'B';
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(2) + 'K';
  }
  return num.toLocaleString();
}

import poolCardBg from "../assets/images/pool-card-bg-new.png";

interface PoolCardProps {
  pool: Pool;
}

function TokenAvatar({
  logoUrl,
  symbol,
  accentColor,
}: {
  logoUrl?: string;
  symbol: string;
  accentColor: string;
}) {
  const [imgError, setImgError] = useState(false);

  if (logoUrl && !imgError) {
    return (
      <div className="relative w-10 h-10 rounded-full overflow-hidden ring-2 ring-white/10">
        <img
          src={logoUrl}
          alt={symbol}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `radial-gradient(circle at center, transparent 40%, ${accentColor} 100%)`,
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="relative w-10 h-10 rounded-full flex items-center justify-center ring-2 ring-white/10"
      style={{
        background: `radial-gradient(circle at 30% 30%, ${accentColor.replace(
          "0.8",
          "0.4"
        )} 0%, rgba(0,0,0,0.9) 70%)`,
      }}
    >
      <span className="text-sm font-bold text-white/90">{symbol.slice(0, 2)}</span>
      <div
        className="absolute inset-0 rounded-full animate-pulse opacity-30"
        style={{ boxShadow: `inset 0 0 12px ${accentColor}` }}
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
  const bgClass = isUp
    ? "bg-green-500/10 border-green-500/20"
    : isDown
      ? "bg-red-500/10 border-red-500/20"
      : "bg-cyan-500/10 border-cyan-500/20";

  return (
    <div className={cn("flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-mono font-bold", bgClass, colorClass)}>
      <TrendIcon className="w-3.5 h-3.5" />
      <span>
        {percent >= 0 ? "+" : ""}
        {percent.toFixed(1)}%
      </span>
    </div>
  );
}

function VortexRing({
  percentFull,
  accentColor,
  poolSize = 0,
  poolSizeTokens = 0,
  symbol = "",
}: {
  percentFull: number;
  accentColor: string;
  poolSize?: number;
  poolSizeTokens?: number;
  symbol?: string;
}) {
  const circumference = 2 * Math.PI * 38;
  const strokeDashoffset = circumference - (circumference * percentFull) / 100;

  return (
    <div className="absolute -right-4 top-1/2 -translate-y-1/2 w-[140px] h-[140px] pointer-events-none overflow-visible">
      <svg className="w-full h-full rotate-[-90deg] relative z-10" viewBox="0 0 100 100">
        <defs>
          <filter id="vortexGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFD875" stopOpacity="1" />
            <stop offset="100%" stopColor="#B8860B" stopOpacity="0.85" />
          </linearGradient>
        </defs>

        {[30, 34, 38, 42].map((r) => (
          <circle
            key={r}
            cx="50"
            cy="50"
            r={r}
            fill="transparent"
            stroke="white"
            strokeWidth="0.5"
            className="opacity-[0.05]"
            strokeDasharray="1 4"
          />
        ))}

        <motion.circle
          cx="50"
          cy="50"
          r="38"
          fill="transparent"
          stroke="url(#ringGradient)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 2.5, ease: "circOut" }}
          style={{ filter: "url(#vortexGlow)" }}
        />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="w-[80px] h-[80px] rounded-full relative overflow-hidden flex flex-col items-center justify-center"
          style={{
            background:
              "radial-gradient(circle at center, rgba(0,0,0,0.95) 25%, rgba(10,10,10,0.9) 55%, rgba(0,0,0,0) 85%)",
          }}
        >
          <motion.div
            className="absolute inset-0 rounded-full z-0"
            animate={{ scale: [0.97, 1.03, 0.97], opacity: [0.08, 0.16, 0.08] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            style={{
              background:
                "radial-gradient(circle at center, rgba(255,216,117,0.18) 0%, rgba(0,0,0,0) 70%)",
            }}
          />

          <div className="relative z-10 flex flex-col items-center justify-center text-center">
            <span className="text-[18px] font-mono font-black text-amber-100 leading-none tabular-nums">
              {formatCompactNumber(poolSizeTokens ?? 0)}
            </span>
            <span className="text-[9px] font-mono font-bold text-white/40 leading-none tabular-nums mt-0.5">
              ≈ ${(poolSize ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[8px] text-white/50 uppercase tracking-[0.25em] font-black leading-none mt-1">
              POOL SIZE
            </span>
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
  status,
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
          <circle cx="22" cy="22" r="18" fill="transparent" stroke="currentColor" strokeWidth="2" className="text-white/10" />
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

function CountdownOverlay({ endTime, lockDuration }: { endTime: Date | null; lockDuration: number }) {
  const countdown = useCountdown(endTime, lockDuration);
  return (
    <div className="bg-black/80 border-2 border-yellow-400 px-6 py-4 rounded-xl shadow-[0_0_30px_rgba(250,204,21,0.4)] flex flex-col items-center gap-2 transform scale-110">
      <Clock className="w-8 h-8 text-yellow-400 animate-pulse" />
      <div className="flex flex-col items-center">
        <span className="text-3xl font-mono font-black text-white leading-none">{countdown.formatted}</span>
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
  const currentPrice = pool.currentPriceUsd || 0;

  // Calculate USD values
  const entryUsd = pool.entryAmount * currentPrice;
  const poolSizeUsd = totalPot * currentPrice;

  const percentFull = Math.min(100, (participantsCount / pool.maxParticipants) * 100);
  const isFull = percentFull >= 100;
  const normalizedStatus = pool.status.toUpperCase();
  const isActive =
    normalizedStatus === "OPEN" ||
    normalizedStatus === "LOCKED" ||
    normalizedStatus === "UNLOCKING" ||
    normalizedStatus === "RANDOMNESS" ||
    normalizedStatus === "RANDOMNESSCOMMITTED" ||
    normalizedStatus === "RANDOMNESSREVEALED";
  const isLocked =
    normalizedStatus === "LOCKED" ||
    normalizedStatus === "UNLOCKING" ||
    normalizedStatus === "RANDOMNESS" ||
    normalizedStatus === "RANDOMNESSCOMMITTED" ||
    normalizedStatus === "RANDOMNESSREVEALED";
  const canDonate =
    normalizedStatus !== "ENDED" &&
    normalizedStatus !== "CANCELLED" &&
    normalizedStatus !== "WINNERSELECTED" &&
    normalizedStatus !== "WINNER";

  const lockEndTime = pool.lockTime ? new Date(new Date(pool.lockTime).getTime() + pool.lockDuration * 60 * 1000) : null;

  const poolAddress = pool.poolAddress;
  const solscanUrl = poolAddress ? `https://solscan.io/account/${poolAddress}` : null;

  const statusConfig: Record<string, { label: string; className: string }> = {
    OPEN: { label: "OPEN", className: "text-primary border-primary/50 bg-primary/10" },
    LOCKED: { label: "HORIZON", className: "text-yellow-400 border-yellow-400/50 bg-yellow-400/10" },
    UNLOCKING: { label: "UNLOCKING", className: "text-orange-400 border-orange-400/50 bg-orange-400/10" },
    RANDOMNESS: { label: "DRAWING", className: "text-purple-400 border-purple-400/50 bg-purple-400/10" },
    RANDOMNESSCOMMITTED: { label: "DRAWING", className: "text-purple-400 border-purple-400/50 bg-purple-400/10" },
    RANDOMNESSREVEALED: { label: "DRAWING", className: "text-purple-400 border-purple-400/50 bg-purple-400/10" },
    WINNERSELECTED: { label: "ESCAPED", className: "text-green-400 border-green-400/50 bg-green-400/10" },
    WINNER: { label: "ESCAPED", className: "text-green-400 border-green-400/50 bg-green-400/10" },
    ENDED: { label: "COLLAPSED", className: "text-gray-500 border-gray-500/50 bg-gray-500/10" },
    CANCELLED: { label: "REFUND", className: "text-red-400 border-red-400/50 bg-red-400/10" },
  };

  const currentStatus = statusConfig[normalizedStatus] || statusConfig.OPEN;

  const handleCopyPoolAddress = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const copyValue = poolAddress || `pool-${pool.id}`;
      navigator.clipboard.writeText(copyValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [poolAddress, pool.id]
  );

  const handleDonateClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDonateModalOpen(true);
  }, []);

  const handleJoinClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (isJoining || !connected || !walletAddress) {
        if (!connected) toast({ title: "Wallet not connected", description: "Please connect your wallet to join" });
        return;
      }

      const poolAny = pool as any;
      const isFreePool = poolAny.isFree === 1;

      setIsJoining(true);
      try {
        // FREE POOL: Gasless join (signature only)
        if (isFreePool) {
          // Import nacl for signing
          const nacl = await import("tweetnacl");
          const bs58 = await import("bs58");

          // Create message to sign (includes poolId and timestamp to prevent replay)
          const timestamp = Date.now();
          const message = `join-free:${pool.id}:${timestamp}`;
          const messageBytes = new TextEncoder().encode(message);

          // Request signature from wallet
          let signatureBytes: Uint8Array;

          try {
            // Get wallet adapter from window (Phantom/Solflare)
            const walletAdapter = (window as any).solana;
            if (!walletAdapter || !walletAdapter.signMessage) {
              throw new Error("Wallet does not support message signing");
            }

            // Phantom returns { signature: Uint8Array, publicKey: PublicKey }
            const signResult = await walletAdapter.signMessage(messageBytes, "utf8");

            // Extract signature (might be in .signature property or directly returned)
            signatureBytes = signResult.signature || signResult;

            if (!(signatureBytes instanceof Uint8Array)) {
              console.error("Invalid signature format:", signatureBytes);
              throw new Error("Wallet returned invalid signature format");
            }
          } catch (signErr: any) {
            console.error("Signature error:", signErr);
            throw new Error("Failed to sign message. Please approve the signature request.");
          }

          // Send to backend FREE join endpoint
          const response = await apiFetch(`/api/pools/${pool.id}/join-free`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              walletAddress: walletAddress,
              message: message,
              signature: bs58.default.encode(signatureBytes),
            }),
            credentials: "include",
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || "Failed to join free pool");
          }

          showTransactionToast({
            type: "success",
            title: "FREE Join Success!",
            description: "You joined the free pool! No tokens transferred.",
            txHash: data.txHash
          });

          queryClient.invalidateQueries({ queryKey: ["/api/pools"] });
          queryClient.invalidateQueries({ queryKey: [`/api/pools/${pool.id}`] });
          queryClient.invalidateQueries({ queryKey: ["/api/profile", walletAddress] });
        } else {
          // NORMAL POOL: Standard on-chain join
          const result = await sdkJoinPool({
            poolId: poolAddress || pool.id.toString(),
            amount: pool.entryAmount.toString(),
          });

          if (!result?.tx) {
            throw new Error("No transaction signature returned from wallet");
          }

          await apiFetch(`/api/pools/${pool.id}/join`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              walletAddress: walletAddress,
              txHash: result.tx,
            }),
            credentials: "include",
          });

          showTransactionToast({
            type: "success",
            title: "Successfully Pulled In!",
            description: "You have joined the void. Your tokens have been transferred.",
            txHash: result.tx
          });

          queryClient.invalidateQueries({ queryKey: ["/api/pools"] });
          queryClient.invalidateQueries({ queryKey: [`/api/pools/${pool.id}`] });
          queryClient.invalidateQueries({ queryKey: ["/api/profile", walletAddress] });
        }
      } catch (err: any) {
        console.error("Join error:", err);
        showTransactionToast({
          type: "error",
          title: "Pull Failed",
          description: err.message || "Failed to join pool"
        });
      } finally {
        setIsJoining(false);
      }
    },
    [isJoining, connected, walletAddress, sdkJoinPool, pool, poolAddress, toast, queryClient]
  );

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      if (donateModalOpen || isJoining) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [donateModalOpen, isJoining]
  );

  return (
    <Link href={`/pool/${pool.id}`} className="block group" data-testid={`card-pool-${pool.id}`} onClick={handleCardClick}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -6, scale: 1.01 }}
        transition={{ duration: 0.3 }}
        className={cn(
          "relative h-full overflow-hidden rounded-2xl border border-white/10 backdrop-blur-xl",
          "transition-all duration-300",
          "hover:border-white/15",
          isActive && "hover:shadow-[0_0_40px_rgba(0,240,255,0.10)]"
        )}
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.80)),
            url(${poolCardBg})
          `,
          backgroundSize: "cover",
          backgroundPosition: "center",
          boxShadow: isActive ? `0 0 28px ${accentColor.replace("0.8", "0.08")}` : undefined,
        }}
      >
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          style={{
            background: `radial-gradient(circle at 80% 50%, ${accentColor.replace("0.8", "0.08")} 0%, transparent 55%)`,
          }}
        />

        <div className="relative z-10 px-4 pt-4 pb-3">
          {/* Locked/Timer Overlay */}
          {isLocked && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute -inset-5 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] pointer-events-none"
            >
              <CountdownOverlay endTime={lockEndTime} lockDuration={pool.lockDuration} />
            </motion.div>
          )}

          {/* Lock Duration (top right) */}
          {normalizedStatus === "OPEN" && !isFull && (
            <div className="absolute top-4 right-4 z-20">
              <div className="px-3 py-1.5 rounded-2xl border border-cyan-300/50 bg-black/40 backdrop-blur-md shadow-[0_0_12px_rgba(34,211,238,0.2)]">
                <div className="flex flex-col items-center leading-none">
                  <span className="text-xs font-mono font-black text-white">{pool.lockDuration}m</span>
                  <span className="text-[7px] text-cyan-200/80 font-black uppercase tracking-[0.1em] mt-0.5">
                    LOCK DURATION
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="flex items-start gap-3 mb-3">
            <TokenAvatar logoUrl={pool.tokenLogoUrl || tokenMetadata?.logoUrl} symbol={pool.tokenSymbol} accentColor={accentColor} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <h3 className="text-[18px] font-black text-white truncate leading-none">{pool.tokenSymbol}</h3>
                <span
                  className={cn(
                    "px-1.5 py-0.5 text-[8px] font-black uppercase border rounded-md tracking-wider shrink-0",
                    currentStatus.className
                  )}
                >
                  {currentStatus.label}
                </span>
                {(pool as any).isFree === 1 && (
                  <span
                    className="px-1.5 py-0.5 text-[8px] font-black uppercase border rounded-md tracking-wider shrink-0 text-green-400 border-green-400/50 bg-green-400/10 animate-pulse"
                  >
                    FREE
                  </span>
                )}
              </div>

              <p className="text-white/45 text-sm truncate mb-3">{pool.tokenName}</p>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyPoolAddress}
                  className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/60 transition-colors"
                  data-testid={`button-copy-pool-${pool.id}`}
                >
                  <span className="font-mono">{poolAddress ? shortenAddress(poolAddress) : `#${pool.id}`}</span>
                  <AnimatePresence mode="wait">
                    {copied ? (
                      <motion.span key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      </motion.span>
                    ) : (
                      <motion.span key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                        <Copy className="w-3.5 h-3.5" />
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
                    className="text-white/35 hover:text-cyan-200 transition-colors"
                    data-testid={`link-solscan-${pool.id}`}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Entry + Ring */}
          <div className="mb-6 relative min-h-[180px] flex items-center">
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-5 backdrop-blur-md w-[58%] z-20">
              <div className="text-[11px] text-white/45 uppercase tracking-[0.35em] mb-2 font-black">ENTRY</div>
              <div className="text-[44px] font-mono font-black text-amber-100 leading-none tabular-nums mb-1">
                {formatCompactNumber(pool.entryAmount)}
              </div>
              <div className="text-[14px] font-mono font-bold text-white/50 leading-none tabular-nums">
                ≈ ${entryUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <VortexRing percentFull={percentFull} accentColor={accentColor} poolSize={poolSizeUsd} poolSizeTokens={totalPot} symbol={pool.tokenSymbol} />
          </div>

          {/* Slots line (like image) */}
          <div className="flex items-center justify-between mb-7">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-white/35" />
              <div className="text-[22px] font-mono text-white">
                <span className="text-cyan-200 font-black">{participantsCount}</span>
                <span className="text-white/45">/{pool.maxParticipants}</span>
                <span className="text-white/35 text-base ml-2">slots</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {pool.initialPriceUsd && pool.currentPriceUsd && (
                <VolatilityBadge initialPrice={pool.initialPriceUsd} currentPrice={pool.currentPriceUsd} />
              )}

              <CountdownRing endTime={lockEndTime} lockDuration={pool.lockDuration} accentColor={accentColor} status={pool.status} />
            </div>
          </div>

          {/* Keep existing progress bars in code, but hidden to match the reference card */}
          <div className="hidden">
            <div className="flex gap-1.5 mb-5">
              {[...Array(Math.min(pool.maxParticipants, 20))].map((_, i) => (
                <motion.div
                  key={i}
                  initial={false}
                  animate={{
                    backgroundColor: i < participantsCount ? accentColor : "rgba(255, 255, 255, 0.05)",
                    boxShadow: i < participantsCount ? `0 0 8px ${accentColor}` : "none",
                  }}
                  transition={{ duration: 0.4, delay: i * 0.02 }}
                  className="h-1 flex-1 rounded-full"
                  style={{ maxWidth: "20px" }}
                />
              ))}
              {pool.maxParticipants > 20 && (
                <span className="text-[9px] text-muted-foreground self-center">+{pool.maxParticipants - 20}</span>
              )}
            </div>
          </div>

          {/* Actions (match image: 1 primary + 2 bottom buttons) */}
          <div className="space-y-3">
            {normalizedStatus === "OPEN" && !isFull && !isLocked && (
              <Button
                className={cn(
                  "w-full h-[56px] rounded-2xl",
                  (pool as any).isFree === 1
                    ? "bg-green-400 hover:bg-green-300 text-black"
                    : "bg-cyan-300 hover:bg-cyan-200 text-black",
                  "font-black uppercase tracking-[0.28em] text-[12px]",
                  (pool as any).isFree === 1
                    ? "shadow-[0_10px_30px_rgba(74,222,128,0.25)]"
                    : "shadow-[0_10px_30px_rgba(34,211,238,0.25)]",
                  "group/btn"
                )}
                onClick={handleJoinClick}
                disabled={isJoining || !connected}
                data-testid={`button-join-pool-${pool.id}`}
              >
                {isJoining ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Joining...
                  </>
                ) : (pool as any).isFree === 1 ? (
                  <>
                    JOIN FREE (NO COST)
                    <ArrowRight className="w-5 h-5 ml-3 transition-transform group-hover/btn:translate-x-0.5" />
                  </>
                ) : (
                  <>
                    GET PULLED IN
                    <ArrowRight className="w-5 h-5 ml-3 transition-transform group-hover/btn:translate-x-0.5" />
                  </>
                )}
              </Button>
            )}

            <div className="grid grid-cols-2 gap-3">
              {canDonate && !isLocked && (
                <Button
                  variant="secondary"
                  onClick={handleDonateClick}
                  className={cn(
                    "h-[56px] rounded-2xl",
                    "bg-violet-600/95 hover:bg-violet-500 text-white",
                    "font-black uppercase tracking-[0.22em] text-[11px]",
                    "shadow-[0_10px_30px_rgba(124,58,237,0.18)]"
                  )}
                  data-testid={`button-donate-pool-${pool.id}`}
                >
                  <Heart className="w-5 h-5 mr-2" />
                  DONATE
                </Button>
              )}

              <Button
                variant="outline"
                className={cn(
                  "h-[56px] rounded-2xl",
                  "bg-white/[0.02] border-white/15 hover:bg-white/[0.05]",
                  "text-white/80",
                  "font-black uppercase tracking-[0.22em] text-[11px]",
                  isLocked && "z-[60] pointer-events-auto bg-black/60 border-yellow-400/50 hover:bg-yellow-400/10"
                )}
                data-testid={`button-view-pool-${pool.id}`}
              >
                <Eye className="w-5 h-5 mr-2" />
                OPEN
              </Button>
            </div>
          </div>
        </div>

        <DonateModal pool={pool} open={donateModalOpen} onOpenChange={setDonateModalOpen} />
      </motion.div>
    </Link>
  );
}

export const PoolCard = memo(PoolCardComponent);
