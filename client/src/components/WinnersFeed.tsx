import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { generateDicebearUrl } from "@/hooks/use-profile";
import { socket } from "@/lib/socket";

interface WinnerFeedEntry {
  id: number;
  poolId: number;
  winnerWallet: string;
  displayName: string;
  avatarUrl: string | null;
  tokenSymbol: string;
  betUsd: number;
  winUsd: number;
  roiPercent: number;
  createdAt: string;
}

export function WinnersFeed() {
  const [winners, setWinners] = useState<WinnerFeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWinners = async () => {
    try {
      const res = await apiFetch("/api/winners/feed");
      if (res.ok) {
        const data = await res.json();
        setWinners(data);
      }
    } catch (err) {
      console.error("[WinnersFeed] Failed to fetch:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWinners();

    // Listen for new winners via WebSocket
    const handleNewWinner = (newWinner: WinnerFeedEntry) => {
      console.log("[WinnersFeed] New winner received:", newWinner);
      setWinners((prev) => {
        // Add new winner at the beginning, keep max 15
        const updated = [newWinner, ...prev].slice(0, 15);
        return updated;
      });
    };

    socket.on("new-winner", handleNewWinner);

    // Fallback: Poll every 30 seconds in case WebSocket misses an event
    const interval = setInterval(fetchWinners, 30000);

    return () => {
      socket.off("new-winner", handleNewWinner);
      clearInterval(interval);
    };
  }, []);

  if (isLoading || winners.length === 0) {
    return null;
  }

  // For smooth infinite scroll: duplicate array with separators between cycles
  const buildDisplayArray = () => {
    const cycles = winners.length < 5 ? 5 : 3; // More duplicates for small sets
    const result = [];

    for (let i = 0; i < cycles; i++) {
      result.push(...winners);
      // Add separator marker after each cycle (except last)
      if (i < cycles - 1) {
        result.push({ id: -1 - i, separator: true } as any);
      }
    }

    return result;
  };

  const displayWinners = buildDisplayArray();

  // Calculate scroll distance: winners + separators
  const cardWidth = 280; // 260px card + 20px gap
  const separatorWidth = 100; // Width of separator
  const separatorsCount = winners.length < 5 ? 4 : 2; // cycles - 1
  const scrollDistance = (winners.length * cardWidth) + (separatorsCount * separatorWidth);

  return (
    <div className="w-full bg-black/80 border-b border-primary/20 backdrop-blur-sm overflow-hidden">
      <div className="relative h-12">
        {/* Gradient fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-black/80 to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-black/80 to-transparent z-10 pointer-events-none" />

        {/* Scrolling container */}
        <motion.div
          className="flex items-center h-full gap-6"
          animate={{
            x: [0, -scrollDistance], // Move exactly one set of unique winners
          }}
          transition={{
            duration: winners.length * 4, // 4 seconds per winner for readable speed
            repeat: Infinity,
            ease: "linear",
          }}
        >
          {displayWinners.map((item, idx) => {
            // Render separator
            if ((item as any).separator) {
              return (
                <div
                  key={`separator-${idx}`}
                  className="flex items-center justify-center min-w-[100px] h-full"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-[2px] bg-gradient-to-r from-transparent via-primary/40 to-primary/40" />
                    <div className="w-2 h-2 rounded-full bg-primary/60 animate-pulse" />
                    <div className="w-8 h-[2px] bg-gradient-to-l from-transparent via-primary/40 to-primary/40" />
                  </div>
                </div>
              );
            }

            // Render winner card
            return <WinnerCard key={`${item.id}-${idx}`} winner={item as WinnerFeedEntry} />;
          })}
        </motion.div>
      </div>
    </div>
  );
}

function WinnerCard({ winner }: { winner: WinnerFeedEntry }) {
  const avatarUrl = winner.avatarUrl || generateDicebearUrl(winner.winnerWallet);
  const isPositiveROI = winner.roiPercent > 0;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900/60 rounded-lg border border-primary/10 hover:border-primary/30 transition-all min-w-[260px]">
      {/* Avatar */}
      <Avatar className="w-10 h-10 border-2 border-primary/30">
        <AvatarImage src={avatarUrl} alt={winner.displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-xs">
          {winner.displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* Winner Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-white truncate">
            {winner.displayName}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {winner.tokenSymbol}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-muted-foreground">
            Bet: <span className="text-white font-mono">${winner.betUsd.toFixed(2)}</span>
          </span>
          <span className="text-muted-foreground">→</span>
          <span className="text-muted-foreground">
            Won: <span className="text-green-400 font-mono font-semibold">${winner.winUsd.toFixed(2)}</span>
          </span>
        </div>
      </div>

      {/* ROI Badge */}
      <div
        className={`px-2 py-1 rounded text-xs font-bold font-mono ${
          isPositiveROI
            ? "bg-green-500/20 text-green-400 border border-green-500/30"
            : "bg-red-500/20 text-red-400 border border-red-500/30"
        }`}
      >
        {isPositiveROI ? "+" : ""}
        {winner.roiPercent.toFixed(0)}%
      </div>
    </div>
  );
}
