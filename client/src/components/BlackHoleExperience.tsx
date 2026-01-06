import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useState, useEffect } from "react";
import { BlackHoleCore } from "./BlackHoleCore";
import { OrbitingAvatarSystem } from "./OrbitingAvatarSystem";
import { CountdownDisplay } from "./CountdownDisplay";
import { RandomnessLoader } from "./RandomnessLoader";
import { WinnerRevealCard } from "./WinnerRevealCard";
import { WinnerAttractionAnimation } from "./WinnerAttractionAnimation";
import { CosmicParticles } from "./CosmicParticles";

export type BlackHolePhase = "orbit" | "countdown" | "randomness" | "attraction" | "reveal";

interface Participant {
  id: number;
  walletAddress: string;
  avatar?: string | null;
  displayAvatar?: string | null;
  displayName?: string;
}

interface BlackHoleExperienceProps {
  status: string;
  participants: Participant[];
  maxParticipants: number;
  lockEndTime?: Date | null;
  winnerWallet?: string | null;
  winnerDisplayName?: string;
  winnerAvatar?: string | null;
  prizeAmount: number;
  tokenSymbol: string;
  payoutTxHash?: string;
}

export function BlackHoleExperience({
  status,
  participants,
  maxParticipants,
  lockEndTime,
  winnerWallet,
  winnerDisplayName,
  winnerAvatar,
  prizeAmount,
  tokenSymbol,
  payoutTxHash,
}: BlackHoleExperienceProps) {
  const normalizedStatus = status.toUpperCase();
  const [attractionComplete, setAttractionComplete] = useState(false);
  const [hasSeenAttraction, setHasSeenAttraction] = useState(false);
  
  const isWinnerKnown = normalizedStatus === "ENDED" || normalizedStatus === "WINNER" || normalizedStatus === "WINNERSELECTED";
  
  useEffect(() => {
    if (isWinnerKnown && !hasSeenAttraction) {
      setAttractionComplete(false);
    }
  }, [isWinnerKnown, hasSeenAttraction]);
  
  const phase: BlackHolePhase = useMemo(() => {
    if (isWinnerKnown) {
      if (!attractionComplete && !hasSeenAttraction) {
        return "attraction";
      }
      return "reveal";
    }
    if (normalizedStatus === "RANDOMNESS" || normalizedStatus === "PROCESSING") {
      return "randomness";
    }
    if (normalizedStatus === "LOCKED" || normalizedStatus === "FULL") {
      return "countdown";
    }
    return "orbit";
  }, [normalizedStatus, isWinnerKnown, attractionComplete, hasSeenAttraction]);
  
  const handleAttractionComplete = () => {
    setAttractionComplete(true);
    setHasSeenAttraction(true);
  };
  
  const intensity = participants.length / maxParticipants;
  
  const defaultAvatar = winnerWallet 
    ? `https://api.dicebear.com/7.x/bottts/svg?seed=${winnerWallet}`
    : "";
  const finalWinnerAvatar = winnerAvatar || defaultAvatar;
  const finalWinnerName = winnerDisplayName || (winnerWallet ? `${winnerWallet.slice(0, 4)}...${winnerWallet.slice(-4)}` : "Winner");
  
  const particlesAccelerated = phase === "countdown" || phase === "randomness";
  const particlesGolden = phase === "reveal";
  
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <CosmicParticles 
        count={35} 
        accelerated={particlesAccelerated}
        golden={particlesGolden}
      />
      
      <div className="relative w-[480px] h-[480px] md:w-[580px] md:h-[580px] z-10">
        <BlackHoleCore 
          intensity={phase === "attraction" ? 1.5 : intensity} 
          status={status} 
        />
        
        {phase !== "reveal" && phase !== "attraction" && (
          <OrbitingAvatarSystem
            participants={participants}
            maxParticipants={maxParticipants}
            winnerWallet={winnerWallet}
            phase={phase}
            orbitRadius={phase === "countdown" || phase === "randomness" ? 220 : 200}
          />
        )}
        
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <AnimatePresence mode="wait">
            {phase === "countdown" && lockEndTime && (
              <motion.div
                key="countdown"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <CountdownDisplay targetTime={lockEndTime} />
              </motion.div>
            )}
            
            {phase === "randomness" && (
              <motion.div
                key="randomness"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <RandomnessLoader />
              </motion.div>
            )}
            
            {phase === "attraction" && winnerWallet && (
              <motion.div
                key="attraction"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0"
              >
                <WinnerAttractionAnimation
                  avatar={finalWinnerAvatar}
                  displayName={finalWinnerName}
                  onComplete={handleAttractionComplete}
                />
              </motion.div>
            )}
            
            {phase === "reveal" && winnerWallet && (
              <motion.div
                key="winner"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="pointer-events-auto"
              >
                <WinnerRevealCard
                  walletAddress={winnerWallet}
                  displayName={winnerDisplayName}
                  avatar={winnerAvatar}
                  prizeAmount={prizeAmount}
                  tokenSymbol={tokenSymbol}
                  txHash={payoutTxHash}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
