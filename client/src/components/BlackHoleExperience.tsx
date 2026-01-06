import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";
import { BlackHoleCore } from "./BlackHoleCore";
import { OrbitingAvatarSystem } from "./OrbitingAvatarSystem";
import { CountdownDisplay } from "./CountdownDisplay";
import { RandomnessLoader } from "./RandomnessLoader";
import { WinnerRevealCard } from "./WinnerRevealCard";

export type BlackHolePhase = "orbit" | "countdown" | "randomness" | "reveal";

interface Participant {
  id: number;
  walletAddress: string;
  avatar?: string | null;
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
  
  const phase: BlackHolePhase = useMemo(() => {
    if (normalizedStatus === "ENDED" || normalizedStatus === "WINNER") {
      return "reveal";
    }
    if (normalizedStatus === "RANDOMNESS") {
      return "randomness";
    }
    if (normalizedStatus === "LOCKED") {
      return "countdown";
    }
    return "orbit";
  }, [normalizedStatus]);
  
  const intensity = participants.length / maxParticipants;
  
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div className="relative w-[480px] h-[480px] md:w-[580px] md:h-[580px]">
        <BlackHoleCore 
          intensity={intensity} 
          status={status} 
        />
        
        {phase !== "reveal" && (
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
            
            {phase === "reveal" && winnerWallet && (
              <motion.div
                key="winner"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
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
