import { motion } from "framer-motion";
import { useState, useEffect } from "react";

const funMessages = [
  "SUMMONING CHAOS",
  "ROLLING COSMIC DICE",
  "CONSULTING THE VOID",
  "BENDING SPACETIME",
  "WARPING REALITY",
  "HACKING THE MATRIX",
  "INVOKING RNG GODS",
  "SPINNING FATE'S WHEEL",
  "QUERYING SINGULARITY",
  "BREAKING PHYSICS",
];

export function RandomnessLoader() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % funMessages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 flex items-center justify-center"
    >
      {/* Main animation container - perfectly centered */}
      <motion.div
        className="relative w-32 h-32 flex items-center justify-center"
      >
        {/* Expanding rings with different colors */}
        {[...Array(4)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full"
            style={{
              border: `2px solid ${i % 2 === 0 ? 'rgba(0, 240, 255, 0.4)' : 'rgba(255, 215, 0, 0.4)'}`,
            }}
            animate={{
              scale: [1, 2.5, 1],
              opacity: [0.8, 0, 0.8],
              rotate: [0, 360],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: i * 0.6,
              ease: "easeInOut",
            }}
          />
        ))}

        {/* Center spinning vortex */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <div className="w-4 h-4 bg-primary rounded-full shadow-[0_0_20px_rgba(0,240,255,1)] relative">
            <motion.div
              className="absolute inset-0 rounded-full bg-primary/30"
              animate={{ scale: [1, 2, 1], opacity: [1, 0, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          </div>
        </motion.div>

        {/* Orbiting particles */}
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={`particle-${i}`}
            className="absolute w-1.5 h-1.5 rounded-full"
            style={{
              left: "50%",
              top: "50%",
              marginLeft: "-3px",
              marginTop: "-3px",
              background: i % 3 === 0 ? '#00f0ff' : i % 3 === 1 ? '#ffd700' : '#ff6b9d',
            }}
            animate={{
              x: [0, Math.cos((i * 30 * Math.PI) / 180) * 50, 0],
              y: [0, Math.sin((i * 30 * Math.PI) / 180) * 50, 0],
              opacity: [1, 0.5, 1],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}

        {/* Text positioned absolutely below - doesn't affect centering */}
        <motion.div
          className="absolute top-full mt-6 left-1/2 -translate-x-1/2 text-center whitespace-nowrap"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <motion.div
            key={messageIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-xs font-tech text-primary uppercase tracking-[0.4em]"
          >
            {funMessages[messageIndex]}
          </motion.div>
          <motion.div
            className="text-[10px] font-tech text-muted-foreground mt-1 uppercase tracking-[0.2em]"
          >
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
            >
              .
            </motion.span>
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
            >
              .
            </motion.span>
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }}
            >
              .
            </motion.span>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
