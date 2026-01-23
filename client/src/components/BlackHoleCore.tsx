import { motion, useAnimation } from "framer-motion";
import { useEffect } from "react";

interface BlackHoleCoreProps {
  intensity: number; // 0 to 1
  status: string;
}

export function BlackHoleCore({ intensity, status }: BlackHoleCoreProps) {
  const controls = useAnimation();
  
  const isActive = status === 'OPEN' || status === 'LOCKED';
  const isWinning = status === 'WINNER' || status === 'RANDOMNESS';

  useEffect(() => {
    controls.start({
      rotate: 360,
      transition: {
        duration: isWinning ? 2 : 20 - (intensity * 15), // Faster as it fills
        ease: "linear",
        repeat: Infinity,
      }
    });
  }, [intensity, isWinning, controls]);

  return (
    <div className="relative w-full aspect-square flex items-center justify-center">
      {/* Glow Field */}
      <motion.div 
        className="absolute inset-[10%] bg-primary/20 blur-[60px] rounded-full"
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />

      {/* Accretion Disk */}
      <motion.div
        animate={controls}
        className="w-[80%] h-[80%] rounded-full border-[1px] border-primary/30 relative"
        style={{
          boxShadow: `0 0 ${intensity * 50}px ${intensity * 20}px rgba(0, 240, 255, 0.2)`
        }}
      >
        <div className="absolute inset-0 rounded-full border border-primary/30 blur-[2px]" />
        <div className="absolute inset-2 rounded-full border border-secondary/20 blur-[1px]" />
      </motion.div>

      {/* Event Horizon (Black Center) */}
      <div className="absolute w-[40%] h-[40%] bg-black rounded-full shadow-[inset_0_0_40px_rgba(0,0,0,1)] z-10 flex items-center justify-center">
        {isWinning && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-full h-full bg-white rounded-full mix-blend-difference"
          />
        )}
      </div>

      {/* Particles */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-white rounded-full"
          animate={{
            x: [0, (Math.random() - 0.5) * 300],
            y: [0, (Math.random() - 0.5) * 300],
            opacity: [1, 0],
            scale: [1, 0],
          }}
          transition={{
            duration: 2 + Math.random() * 2,
            repeat: Infinity,
            delay: Math.random() * 2,
          }}
        />
      ))}
    </div>
  );
}
