import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useEffect } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { generateDicebearUrl, shortenWallet } from "@/hooks/use-profile";
import { SoundManager } from "@/lib/SoundManager";

interface Participant {
  id: number;
  walletAddress: string;
  avatar?: string | null;
  displayAvatar?: string | null;
  displayName?: string;
}

interface OrbitingAvatarSystemProps {
  participants: Participant[];
  maxParticipants: number;
  winnerWallet?: string | null;
  phase: "orbit" | "countdown" | "randomness" | "reveal" | "attraction";
  orbitRadius?: number;
}

export function OrbitingAvatarSystem({
  participants,
  maxParticipants,
  winnerWallet,
  phase,
  orbitRadius = 200,
}: OrbitingAvatarSystemProps) {
  const intensity = participants.length / maxParticipants;
  const baseSpeed = phase === "randomness" ? 2 : 12;
  const orbitSpeed = baseSpeed * (1 - intensity * 0.4);
  
  const motionBlurAmount = phase === "randomness" 
    ? 4 
    : phase === "countdown" 
    ? 2 + intensity * 2 
    : 1 + intensity;
  
  const glowIntensity = phase === "randomness" 
    ? 0.9 
    : phase === "countdown" 
    ? 0.5 + intensity * 0.3 
    : 0.3 + intensity * 0.2;

  useEffect(() => {
    if (phase === "orbit" && participants.length > 0) {
      SoundManager.fadeIn("orbit_whoosh", 2000);
    } else if (phase === "countdown") {
      SoundManager.fadeOut("orbit_whoosh", 1000);
      SoundManager.fadeIn("event_horizon_hum", 1500);
    } else if (phase === "randomness") {
      SoundManager.play("singularity_pulse");
    }
    
    return () => {
      if (phase === "reveal" || phase === "attraction") {
        SoundManager.fadeOut("event_horizon_hum", 500);
      }
    };
  }, [phase, participants.length]);
  
  const avatarPositions = useMemo(() => {
    return participants.map((p, index) => {
      const angleOffset = (360 / Math.max(participants.length, 1)) * index;
      return {
        ...p,
        angleOffset,
        isWinner: p.walletAddress === winnerWallet,
      };
    });
  }, [participants, winnerWallet]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      <AnimatePresence>
        {avatarPositions.map((participant) => {
          const isWinner = participant.isWinner && phase === "reveal";
          const shouldFadeOut = phase === "reveal" && !participant.isWinner;
          
          return (
            <motion.div
              key={participant.id}
              className="absolute"
              style={{
                left: "50%",
                top: "50%",
                marginLeft: -20,
                marginTop: -20,
                filter: phase === "randomness" 
                  ? `blur(${motionBlurAmount * 0.5}px)` 
                  : "none",
              }}
              initial={{ 
                opacity: 0, 
                scale: 0,
                x: 0,
                y: 0,
              }}
              animate={
                isWinner
                  ? {
                      opacity: 1,
                      scale: 1.5,
                      x: 0,
                      y: 0,
                      rotate: 0,
                    }
                  : shouldFadeOut
                  ? {
                      opacity: 0,
                      scale: 0.3,
                      x: Math.cos((participant.angleOffset * Math.PI) / 180) * (orbitRadius * 0.5),
                      y: Math.sin((participant.angleOffset * Math.PI) / 180) * (orbitRadius * 0.5),
                    }
                  : {
                      opacity: 1,
                      scale: 1,
                      x: 0,
                      y: 0,
                    }
              }
              exit={{ opacity: 0, scale: 0 }}
              transition={
                isWinner
                  ? { duration: 1.5, ease: [0.25, 0.46, 0.45, 0.94] }
                  : { duration: 0.5 }
              }
            >
              <motion.div
                animate={
                  phase !== "reveal"
                    ? { rotate: 360 }
                    : { rotate: 0 }
                }
                transition={
                  phase !== "reveal"
                    ? {
                        duration: orbitSpeed,
                        repeat: Infinity,
                        ease: "linear",
                      }
                    : { duration: 0.5 }
                }
                style={{
                  transformOrigin: "center center",
                }}
              >
                <motion.div
                  style={{
                    x: Math.cos((participant.angleOffset * Math.PI) / 180) * orbitRadius,
                    y: Math.sin((participant.angleOffset * Math.PI) / 180) * orbitRadius,
                  }}
                  animate={
                    isWinner
                      ? { x: 0, y: 0 }
                      : {
                          x: Math.cos((participant.angleOffset * Math.PI) / 180) * orbitRadius,
                          y: Math.sin((participant.angleOffset * Math.PI) / 180) * orbitRadius,
                        }
                  }
                  transition={
                    isWinner
                      ? { duration: 1.5, ease: [0.25, 0.46, 0.45, 0.94] }
                      : { duration: 0 }
                  }
                >
                  <OrbitingAvatar
                    walletAddress={participant.walletAddress}
                    avatar={participant.displayAvatar || participant.avatar}
                    displayName={participant.displayName}
                    isWinner={isWinner}
                    phase={phase}
                    glowIntensity={glowIntensity}
                    motionBlur={motionBlurAmount}
                  />
                </motion.div>
              </motion.div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

interface OrbitingAvatarProps {
  walletAddress: string;
  avatar?: string | null;
  displayName?: string;
  isWinner: boolean;
  phase: string;
  glowIntensity: number;
  motionBlur: number;
}

function OrbitingAvatar({ 
  walletAddress, 
  avatar, 
  displayName, 
  isWinner, 
  phase,
  glowIntensity,
  motionBlur 
}: OrbitingAvatarProps) {
  const avatarUrl = avatar || generateDicebearUrl(walletAddress);
  const name = displayName || shortenWallet(walletAddress);
  
  const glowSize = 10 + glowIntensity * 15;
  const glowOpacity = 0.5 + glowIntensity * 0.3;
  
  return (
    <motion.div
      className={`relative ${isWinner ? "z-50" : "z-10"}`}
      animate={{
        rotate: phase !== "reveal" ? -360 : 0,
      }}
      transition={{
        duration: phase === "randomness" ? 2 : 12,
        repeat: phase !== "reveal" ? Infinity : 0,
        ease: "linear",
      }}
      style={{
        filter: phase === "randomness" 
          ? `drop-shadow(${motionBlur}px 0 ${motionBlur * 2}px rgba(0, 240, 255, 0.4))`
          : "none",
      }}
    >
      <motion.div
        className="absolute -inset-1 rounded-full"
        style={{
          background: isWinner 
            ? `radial-gradient(circle, rgba(250,204,21,${glowOpacity}) 0%, transparent 70%)`
            : `radial-gradient(circle, rgba(0,240,255,${glowOpacity * 0.6}) 0%, transparent 70%)`,
          filter: `blur(${glowSize * 0.5}px)`,
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [glowOpacity, glowOpacity * 1.3, glowOpacity],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      
      <div
        className={`
          w-10 h-10 rounded-full overflow-hidden relative z-10
          border-2 ${isWinner ? "border-yellow-400" : "border-primary/50"}
          bg-black
        `}
        style={{
          boxShadow: isWinner 
            ? `0 0 ${glowSize}px rgba(250,204,21,${glowOpacity})`
            : `0 0 ${glowSize}px rgba(0,240,255,${glowOpacity * 0.5})`,
        }}
      >
        <Avatar className="w-full h-full">
          <AvatarImage src={avatarUrl} alt={name} />
          <AvatarFallback className="bg-primary/20 text-primary text-xs">
            {name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </div>
      
      {isWinner && (
        <motion.div
          className="absolute -inset-2 rounded-full border-2 border-yellow-400/50"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.8, 0.3, 0.8],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}
    </motion.div>
  );
}
