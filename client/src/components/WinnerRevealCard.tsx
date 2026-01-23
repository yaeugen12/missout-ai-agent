import { motion } from "framer-motion";
import { useEffect } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { generateDicebearUrl, shortenWallet } from "@/hooks/use-profile";
import { Trophy, Sparkles, ExternalLink } from "lucide-react";
import { SoundManager } from "@/lib/SoundManager";

interface WinnerRevealCardProps {
  walletAddress: string;
  displayName?: string;
  avatar?: string | null;
  prizeAmount: number;
  tokenSymbol: string;
  priceUsd?: number;
  txHash?: string;
}

export function WinnerRevealCard({
  walletAddress,
  displayName,
  avatar,
  prizeAmount,
  tokenSymbol,
  priceUsd = 0,
  txHash,
}: WinnerRevealCardProps) {
  const avatarUrl = avatar || generateDicebearUrl(walletAddress);
  const name = displayName || shortenWallet(walletAddress);

  const getSolscanUrl = (hash: string) => `https://solscan.io/tx/${hash}`;

  useEffect(() => {
    SoundManager.play("reveal_burst");
  }, []);
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="relative"
    >
      <motion.div
        className="absolute inset-0 -m-32 bg-black/60 backdrop-blur-md rounded-full"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 3 }}
        transition={{ duration: 0.5 }}
      />
      
      <motion.div
        className="absolute inset-0 -m-16"
        initial={{ opacity: 0 }}
        animate={{ 
          opacity: [0, 1, 0.5, 0],
          scale: [0.5, 1.5, 2, 2.5],
        }}
        transition={{ duration: 0.8, times: [0, 0.2, 0.5, 1] }}
        style={{
          background: "radial-gradient(circle, rgba(34,211,238,0.8) 0%, rgba(255,255,255,0.6) 30%, rgba(34,211,238,0.4) 60%, transparent 80%)",
        }}
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.3, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{
          duration: 0.8,
          delay: 0.3,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
        className="relative z-10"
      >
        <motion.div
          className="absolute -inset-4 bg-gradient-to-r from-yellow-500/30 via-primary/30 to-yellow-500/30 rounded-3xl blur-xl"
          animate={{
            opacity: [0.4, 0.7, 0.4],
            scale: [0.95, 1.05, 0.95],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        />
        
        <div className="relative bg-gradient-to-b from-zinc-900/95 to-black/95 border border-yellow-500/40 rounded-2xl p-8 backdrop-blur-xl shadow-[0_0_80px_rgba(250,204,21,0.3)]">
          <motion.div
            className="absolute -top-6 left-1/2 -translate-x-1/2"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: [0, -5, 0], opacity: 1 }}
            transition={{ 
              y: { duration: 2, repeat: Infinity, delay: 0.5 },
              opacity: { duration: 0.3, delay: 0.4 }
            }}
          >
            <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 px-6 py-2 rounded-full flex items-center gap-2 shadow-[0_0_30px_rgba(250,204,21,0.5)]">
              <Trophy className="w-4 h-4 text-black" />
              <span className="text-xs font-bold text-black uppercase tracking-wider">Escaped The Void</span>
              <Sparkles className="w-4 h-4 text-black" />
            </div>
          </motion.div>
          
          <div className="flex flex-col items-center pt-4">
            <motion.div
              className="relative mb-4"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.6, delay: 0.4, type: "spring" }}
            >
              <motion.div
                className="absolute -inset-3 rounded-full bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-400"
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                style={{ padding: 3 }}
              />
              <motion.div
                className="absolute -inset-4 rounded-full"
                animate={{
                  boxShadow: [
                    "0 0 20px rgba(250,204,21,0.4), 0 0 40px rgba(250,204,21,0.2)",
                    "0 0 40px rgba(250,204,21,0.6), 0 0 80px rgba(250,204,21,0.3)",
                    "0 0 20px rgba(250,204,21,0.4), 0 0 40px rgba(250,204,21,0.2)",
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <Avatar className="w-24 h-24 border-4 border-black relative z-10">
                <AvatarImage src={avatarUrl} alt={name} />
                <AvatarFallback className="bg-yellow-500/20 text-yellow-400 text-2xl font-bold">
                  {name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              <motion.div
                className="absolute -inset-6 rounded-full border border-yellow-500/40"
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.6, 0, 0.6],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </motion.div>
            
            <motion.h3
              className="text-2xl font-display font-bold text-white mb-1"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              {name}
            </motion.h3>
            
            <motion.p
              className="text-xs font-mono text-muted-foreground mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              {shortenWallet(walletAddress)}
            </motion.p>
            
            <motion.div
              className="bg-gradient-to-r from-yellow-500/10 via-yellow-500/25 to-yellow-500/10 rounded-xl p-4 w-full text-center border border-yellow-500/30"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.7 }}
            >
              <div className="text-[10px] font-tech text-yellow-500/70 uppercase tracking-[0.3em] mb-1">
                Prize Claimed
              </div>
              <motion.div
                className="text-3xl font-mono font-black text-yellow-400"
                animate={{
                  textShadow: [
                    "0 0 20px rgba(250,204,21,0.5)",
                    "0 0 40px rgba(250,204,21,0.8)",
                    "0 0 20px rgba(250,204,21,0.5)",
                  ],
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                {prizeAmount.toFixed(2)} {tokenSymbol}
              </motion.div>
              {priceUsd > 0 && (
                <div className="text-sm font-mono text-green-400 mt-2">
                  ${(prizeAmount * priceUsd).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </div>
              )}
            </motion.div>
            
            {txHash && (
              <motion.a
                href={getSolscanUrl(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex items-center gap-2 text-xs font-tech text-primary/60 hover:text-primary transition-colors"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
              >
                <span>View Transaction</span>
                <ExternalLink className="w-3 h-3" />
              </motion.a>
            )}
          </div>
          
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 bg-yellow-400 rounded-full"
              style={{
                left: `${15 + Math.random() * 70}%`,
                top: `${15 + Math.random() * 70}%`,
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0, 1.5, 0],
                y: [0, -30, -60],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                delay: 0.8 + i * 0.2,
              }}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
