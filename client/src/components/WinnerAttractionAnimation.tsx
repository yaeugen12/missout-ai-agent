import { motion, useAnimation } from "framer-motion";
import { useEffect, useState } from "react";

interface WinnerAttractionAnimationProps {
  avatar: string;
  displayName: string;
  onComplete: () => void;
}

export function WinnerAttractionAnimation({
  avatar,
  displayName,
  onComplete,
}: WinnerAttractionAnimationProps) {
  const [phase, setPhase] = useState<"hint" | "pull">("hint");
  const glowControls = useAnimation();
  const pullControls = useAnimation();

  useEffect(() => {
    const runAnimation = async () => {
      await glowControls.start({
        boxShadow: [
          "0 0 30px rgba(234, 179, 8, 0.6)",
          "0 0 60px rgba(234, 179, 8, 0.9)",
          "0 0 40px rgba(234, 179, 8, 0.7)",
        ],
        scale: [1, 1.15, 1.1],
        transition: { duration: 0.8, ease: "easeInOut" }
      });
      
      setPhase("pull");
      
      await pullControls.start({
        scale: 0,
        y: 180,
        opacity: 0,
        rotate: 1080,
        filter: "brightness(2) blur(4px)",
        transition: { 
          duration: 0.5, 
          ease: [0.6, 0, 0.4, 1],
        }
      });
      
      onComplete();
    };
    
    runAnimation();
  }, [glowControls, pullControls, onComplete]);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <motion.div
        animate={pullControls}
        initial={{ scale: 1, y: -180, opacity: 1, rotate: 0, filter: "brightness(1)" }}
        className="relative flex flex-col items-center"
      >
        <motion.div
          animate={glowControls}
          className="relative"
          initial={{ 
            boxShadow: "0 0 30px rgba(234, 179, 8, 0.6)",
            scale: 1,
          }}
          style={{ borderRadius: "50%" }}
        >
          <motion.div
            className="absolute -inset-2 rounded-full"
            animate={phase === "hint" ? {
              opacity: [0, 0.8, 0],
              scale: [1, 1.5, 2],
            } : {}}
            transition={{ duration: 0.4 }}
            style={{
              background: "radial-gradient(circle, rgba(234,179,8,0.6) 0%, transparent 70%)",
            }}
          />
          
          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-yellow-400 relative z-10">
            <img
              src={avatar}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          </div>
          
          <motion.div
            className="absolute -inset-4 rounded-full border-2 border-yellow-300/60"
            animate={{
              scale: [1, 1.3, 1.6],
              opacity: [0.8, 0.4, 0],
            }}
            transition={{
              duration: 0.6,
              repeat: 2,
              ease: "easeOut"
            }}
          />
        </motion.div>
        
        <motion.span
          className="mt-3 text-sm font-bold text-yellow-400 uppercase tracking-wider whitespace-nowrap"
          animate={{ opacity: phase === "pull" ? 0 : 1 }}
          transition={{ duration: 0.2 }}
        >
          {displayName}
        </motion.span>
      </motion.div>
      
      <motion.div
        className="absolute w-48 h-48 rounded-full pointer-events-none"
        initial={{ scale: 0, opacity: 0 }}
        animate={phase === "pull" ? { 
          scale: [0, 2, 3], 
          opacity: [0, 0.5, 0] 
        } : {}}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{
          background: "radial-gradient(circle, rgba(234,179,8,0.5) 0%, rgba(34,211,238,0.3) 50%, transparent 70%)",
        }}
      />
    </div>
  );
}
