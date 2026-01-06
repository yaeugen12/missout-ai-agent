import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface CountdownDisplayProps {
  targetTime: Date | null;
  onComplete?: () => void;
}

export function CountdownDisplay({ targetTime, onComplete }: CountdownDisplayProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  
  useEffect(() => {
    if (!targetTime) return;
    
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const target = new Date(targetTime).getTime();
      const diff = Math.max(0, Math.floor((target - now) / 1000));
      return diff;
    };
    
    setTimeLeft(calculateTimeLeft());
    
    const interval = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      
      if (remaining <= 0) {
        clearInterval(interval);
        onComplete?.();
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [targetTime, onComplete]);
  
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  
  const formatTime = (num: number) => num.toString().padStart(2, "0");
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      className="flex flex-col items-center justify-center"
    >
      <motion.div
        className="text-[10px] font-tech text-primary/60 uppercase tracking-[0.4em] mb-2"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        Event Horizon
      </motion.div>
      
      <motion.div
        className="text-5xl md:text-6xl font-mono font-black text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]"
        animate={{ 
          textShadow: [
            "0 0 20px rgba(0,240,255,0.5)",
            "0 0 40px rgba(0,240,255,0.8)",
            "0 0 20px rgba(0,240,255,0.5)",
          ]
        }}
        transition={{ duration: 1, repeat: Infinity }}
      >
        {formatTime(minutes)}:{formatTime(seconds)}
      </motion.div>
      
      <motion.div
        className="text-[10px] font-tech text-muted-foreground uppercase tracking-[0.3em] mt-2"
      >
        Until Collapse
      </motion.div>
      
      {timeLeft <= 10 && timeLeft > 0 && (
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-red-500/50"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{ duration: 0.5, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
}
