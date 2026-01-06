import { useEffect, useRef, useState } from "react";
import { type Participant } from "@shared/schema";
import { motion, useAnimation } from "framer-motion";
import { cn } from "@/lib/utils";

interface RouletteRevealProps {
  participants: Participant[];
  winnerAddress?: string | null;
  onComplete: () => void;
}

export function RouletteReveal({ participants, winnerAddress, onComplete }: RouletteRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<Participant[]>([]);
  const controls = useAnimation();
  const CARD_WIDTH = 100; // px
  const GAP = 16; // px

  useEffect(() => {
    if (!participants.length || !winnerAddress) return;

    // Build the roulette strip:
    // [Buffer Items] ... [Winner] ... [Buffer Items]
    // We want the winner to land exactly in the center.
    
    // Create a long list for the scrolling effect
    const winner = participants.find(p => p.walletAddress === winnerAddress);
    if (!winner) return;

    const fillerBefore = Array(30).fill(null).map(() => participants[Math.floor(Math.random() * participants.length)]);
    const fillerAfter = Array(5).fill(null).map(() => participants[Math.floor(Math.random() * participants.length)]);
    
    // The "landing" index of the winner. 
    // If we have 30 items before, the winner is at index 30.
    const winnerIndex = 30; 
    
    setItems([...fillerBefore, winner, ...fillerAfter]);

    // Animate
    const totalDistance = (winnerIndex * (CARD_WIDTH + GAP));
    const randomOffset = (Math.random() * CARD_WIDTH * 0.4) - (CARD_WIDTH * 0.2); 

    controls.start({
      x: -totalDistance + randomOffset,
      transition: { 
        duration: 8, 
        ease: [0.1, 0.4, 0.1, 1] 
      }
    }).then(() => {
      onComplete();
    });

  }, [participants, winnerAddress, controls, onComplete]);

  return (
    <div className="relative w-full h-40 bg-black border-y border-primary/30 overflow-hidden flex items-center">
      {/* Center Marker */}
      <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-yellow-500 z-20 -translate-x-1/2 shadow-[0_0_20px_rgba(234,179,8,0.8)]" />
      <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 border-l-[10px] border-r-[10px] border-t-[10px] border-l-transparent border-r-transparent border-t-yellow-500 z-20" />
      <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 border-l-[10px] border-r-[10px] border-b-[10px] border-l-transparent border-r-transparent border-b-yellow-500 z-20" />

      {/* Moving Strip */}
      <motion.div 
        animate={controls}
        className="flex items-center gap-4 pl-[calc(50%-50px)]" // Start with first item centered
        style={{ x: 0 }}
      >
        {items.map((p, i) => (
          <div 
            key={i}
            className={cn(
              "flex-shrink-0 w-[100px] h-[100px] bg-muted border border-white/10 rounded-lg flex flex-col items-center justify-center p-2 relative overflow-hidden",
              p.walletAddress === winnerAddress && "border-yellow-500/50" // Subtle hint
            )}
          >
            <img 
              src={p.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${p.walletAddress}`} 
              alt="Avatar" 
              className="w-12 h-12 mb-2" 
            />
            <div className="text-[10px] font-mono text-muted-foreground truncate w-full text-center">
              {p.walletAddress.slice(0, 6)}...
            </div>
          </div>
        ))}
      </motion.div>
      
      {/* Vignette */}
      <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none" />
    </div>
  );
}
