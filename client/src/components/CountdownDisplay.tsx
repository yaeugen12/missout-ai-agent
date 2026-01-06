import { motion, useAnimation } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import { SoundManager } from "@/lib/SoundManager";

interface CountdownDisplayProps {
  targetTime: Date | null;
  onComplete?: () => void;
}

export function CountdownDisplay({ targetTime, onComplete }: CountdownDisplayProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [showEventHorizonReached, setShowEventHorizonReached] = useState(true);
  const lastTickRef = useRef<number>(-1);
  const controls = useAnimation();
  
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
      
      if (remaining <= 3 && remaining > 0 && remaining !== lastTickRef.current) {
        lastTickRef.current = remaining;
        SoundManager.play("countdown_tick");
      }
      
      if (remaining <= 0) {
        clearInterval(interval);
        onComplete?.();
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [targetTime, onComplete]);
  
  useEffect(() => {
    if (showEventHorizonReached) {
      controls.start({
        opacity: [0, 1, 1, 0],
        scale: [0.8, 1.1, 1, 0.9],
        transition: { duration: 2, times: [0, 0.2, 0.8, 1] }
      }).then(() => {
        setShowEventHorizonReached(false);
      });
    }
  }, [showEventHorizonReached, controls]);
  
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formatTime = (num: number) => num.toString().padStart(2, "0");
  
  const isUrgent = timeLeft <= 10 && timeLeft > 0;
  const isFinalCountdown = timeLeft <= 3 && timeLeft > 0;
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      className="flex flex-col items-center justify-center relative"
    >
      {showEventHorizonReached && (
        <motion.div
          animate={controls}
          className="absolute -top-16 text-sm font-tech uppercase tracking-[0.4em] text-center"
          style={{
            background: "linear-gradient(90deg, #22d3ee, #facc15, #22d3ee)",
            backgroundSize: "200% 100%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Event Horizon Reached
        </motion.div>
      )}
      
      <motion.div
        className="w-32 h-1 rounded-full mb-4 overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.1)",
        }}
      >
        <motion.div
          className="h-full rounded-full"
          animate={{
            background: [
              "linear-gradient(90deg, #22d3ee, #06b6d4)",
              "linear-gradient(90deg, #facc15, #eab308)",
              "linear-gradient(90deg, #22d3ee, #06b6d4)",
            ],
            boxShadow: [
              "0 0 10px #22d3ee, 0 0 20px #22d3ee",
              "0 0 15px #facc15, 0 0 30px #facc15",
              "0 0 10px #22d3ee, 0 0 20px #22d3ee",
            ],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{ width: "100%" }}
        />
      </motion.div>
      
      <motion.div
        className="text-[10px] font-tech text-primary/60 uppercase tracking-[0.4em] mb-2"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        Event Horizon
      </motion.div>
      
      <motion.div
        className="relative"
        animate={isFinalCountdown ? {
          x: [0, -2, 2, -2, 2, 0],
          transition: { duration: 0.3, repeat: Infinity }
        } : {}}
      >
        <motion.div
          className={`text-5xl md:text-6xl font-mono font-black drop-shadow-[0_0_30px_rgba(255,255,255,0.3)] ${
            isUrgent ? "text-red-400" : "text-white"
          }`}
          animate={{ 
            textShadow: isUrgent 
              ? [
                  "0 0 20px rgba(239,68,68,0.5)",
                  "0 0 40px rgba(239,68,68,0.8)",
                  "0 0 20px rgba(239,68,68,0.5)",
                ]
              : [
                  "0 0 20px rgba(0,240,255,0.5)",
                  "0 0 40px rgba(0,240,255,0.8)",
                  "0 0 20px rgba(0,240,255,0.5)",
                ],
            scale: isFinalCountdown ? [1, 1.05, 1] : 1,
          }}
          transition={{ duration: isFinalCountdown ? 0.5 : 1, repeat: Infinity }}
        >
          {formatTime(minutes)}:{formatTime(seconds)}
        </motion.div>
      </motion.div>
      
      <motion.div
        className="text-[10px] font-tech text-muted-foreground uppercase tracking-[0.3em] mt-2"
      >
        Until Collapse
      </motion.div>
      
      {isUrgent && (
        <motion.div
          className="absolute -inset-8 rounded-full border-2 border-red-500/50"
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{ duration: 0.5, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
}
