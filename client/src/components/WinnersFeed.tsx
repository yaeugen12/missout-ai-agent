import { useEffect, useState, useCallback } from "react";
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
  const [isVisible, setIsVisible] = useState(true);

  // Hide when scrolling down past 200px
  useEffect(() => {
    let lastScrollY = window.scrollY;
    
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      // Hide after scrolling 200px down
      setIsVisible(currentScrollY < 200);
      lastScrollY = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
  const cardWidth = 220; // Reduced from 280 (200px card + 20px gap)
  const separatorWidth = 80; // Reduced from 100
  const separatorsCount = winners.length < 5 ? 4 : 2; // cycles - 1
  const scrollDistance = (winners.length * cardWidth) + (separatorsCount * separatorWidth);

  return (
    <motion.div 
      className="fixed top-14 left-0 right-0 bg-transparent border-none overflow-hidden z-50 pointer-events-none"
      initial={{ opacity: 1, y: 0 }}
      animate={{ 
        opacity: isVisible ? 1 : 0, 
        y: isVisible ? 0 : -20 
      }}
      transition={{ duration: 0.3 }}
    >
      <div className="relative h-11 flex items-center pointer-events-auto">
        {/* Gradient fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-black/20 via-black/10 to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-black/20 via-black/10 to-transparent z-10 pointer-events-none" />

        {/* Scrolling container */}
        <motion.div
          className="flex items-center h-full gap-5"
          animate={{
            x: [0, -scrollDistance], // Move exactly one set of unique winners
          }}
          transition={{
            duration: winners.length * 8, // Doubled duration (from 4 to 8) to make it slower
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
    </motion.div>
  );
}

function WinnerCard({ winner }: { winner: WinnerFeedEntry }) {
  const avatarUrl = winner.avatarUrl || generateDicebearUrl(winner.winnerWallet);
  const isPositiveROI = winner.roiPercent > 0;

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-black/20 backdrop-blur-sm rounded-full border border-white/5 hover:bg-white/[0.06] transition-all min-w-[200px] group h-8">
      {/* Avatar */}
      <Avatar className="w-6 h-6 border border-primary/30">
        <AvatarImage src={avatarUrl} alt={winner.displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-[8px]">
          {winner.displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* Winner Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-bold text-white/90 truncate">
            {winner.displayName}
          </span>
          <span className="text-[9px] text-muted-foreground font-mono opacity-70">
            {winner.tokenSymbol}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[9px] leading-none">
          <span className="text-green-400 font-mono font-bold">${winner.winUsd.toFixed(1)}</span>
          <span className="text-white/30 text-[8px] font-mono">
            {isPositiveROI ? "+" : ""}{winner.roiPercent.toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}
