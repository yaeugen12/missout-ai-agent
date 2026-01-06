import { motion } from "framer-motion";

export function RandomnessLoader() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center"
    >
      <motion.div
        className="relative w-24 h-24"
      >
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border border-primary/40"
            animate={{
              scale: [1, 2, 1],
              opacity: [0.8, 0, 0.8],
              rotate: [0, 180, 360],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.4,
              ease: "easeInOut",
            }}
          />
        ))}
        
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <div className="w-2 h-2 bg-primary rounded-full shadow-[0_0_10px_rgba(0,240,255,0.8)]" />
        </motion.div>
        
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={`particle-${i}`}
            className="absolute w-1 h-1 bg-secondary rounded-full"
            style={{
              left: "50%",
              top: "50%",
            }}
            animate={{
              x: [0, Math.cos((i * 45 * Math.PI) / 180) * 40, 0],
              y: [0, Math.sin((i * 45 * Math.PI) / 180) * 40, 0],
              opacity: [1, 0.3, 1],
              scale: [1, 0.5, 1],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: i * 0.1,
              ease: "easeInOut",
            }}
          />
        ))}
      </motion.div>
      
      <motion.div
        className="mt-6 text-center"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <div className="text-xs font-tech text-primary uppercase tracking-[0.4em]">
          Querying Singularity
        </div>
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
  );
}
