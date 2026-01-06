import { motion } from "framer-motion";

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
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <motion.div
        className="relative flex flex-col items-center"
        initial={{ 
          scale: 1.2, 
          y: -180,
          opacity: 1,
          filter: "brightness(1.5) drop-shadow(0 0 30px rgba(234, 179, 8, 0.8))"
        }}
        animate={{ 
          scale: 0,
          y: 0,
          opacity: 0,
          filter: "brightness(2) drop-shadow(0 0 60px rgba(234, 179, 8, 1))"
        }}
        transition={{ 
          duration: 1.8,
          ease: [0.25, 0.1, 0.25, 1],
          scale: { duration: 1.8, ease: "easeIn" },
          y: { duration: 1.8, ease: [0.6, 0, 0.4, 1] },
          opacity: { duration: 1.8, delay: 0.3 }
        }}
        onAnimationComplete={onComplete}
      >
        <motion.div
          className="relative"
          animate={{ 
            rotate: [0, 360, 720, 1080],
          }}
          transition={{ 
            duration: 1.8, 
            ease: "easeIn"
          }}
        >
          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-yellow-400 shadow-[0_0_40px_rgba(234,179,8,0.6)]">
            <img
              src={avatar}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          </div>
          
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-yellow-300/50"
            animate={{
              scale: [1, 2, 3],
              opacity: [0.8, 0.4, 0],
            }}
            transition={{
              duration: 1,
              repeat: 2,
              ease: "easeOut"
            }}
          />
        </motion.div>
        
        <motion.span
          className="mt-3 text-sm font-bold text-yellow-400 uppercase tracking-wider whitespace-nowrap"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          {displayName}
        </motion.span>
      </motion.div>
      
      <motion.div
        className="absolute w-40 h-40 rounded-full"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 3, 5], opacity: [0, 0.6, 0] }}
        transition={{ duration: 1.8, delay: 0.5, ease: "easeOut" }}
        style={{
          background: "radial-gradient(circle, rgba(234,179,8,0.4) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
