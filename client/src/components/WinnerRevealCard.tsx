import { motion } from "framer-motion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { generateDicebearUrl, shortenWallet } from "@/hooks/use-profile";
import { Trophy, Sparkles, ExternalLink } from "lucide-react";

interface WinnerRevealCardProps {
  walletAddress: string;
  displayName?: string;
  avatar?: string | null;
  prizeAmount: number;
  tokenSymbol: string;
  txHash?: string;
}

export function WinnerRevealCard({
  walletAddress,
  displayName,
  avatar,
  prizeAmount,
  tokenSymbol,
  txHash,
}: WinnerRevealCardProps) {
  const avatarUrl = avatar || generateDicebearUrl(walletAddress);
  const name = displayName || shortenWallet(walletAddress);
  
  const getSolscanUrl = (hash: string) => `https://solscan.io/tx/${hash}?cluster=devnet`;
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.3, y: 50 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        duration: 0.8,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className="relative"
    >
      <motion.div
        className="absolute -inset-4 bg-gradient-to-r from-yellow-500/20 via-primary/20 to-yellow-500/20 rounded-3xl blur-xl"
        animate={{
          opacity: [0.3, 0.6, 0.3],
          scale: [0.95, 1.05, 0.95],
        }}
        transition={{ duration: 3, repeat: Infinity }}
      />
      
      <div className="relative bg-gradient-to-b from-zinc-900/95 to-black/95 border border-yellow-500/30 rounded-2xl p-8 backdrop-blur-xl shadow-[0_0_60px_rgba(250,204,21,0.2)]">
        <motion.div
          className="absolute -top-6 left-1/2 -translate-x-1/2"
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 px-6 py-2 rounded-full flex items-center gap-2 shadow-lg">
            <Trophy className="w-4 h-4 text-black" />
            <span className="text-xs font-bold text-black uppercase tracking-wider">Escaped The Void</span>
            <Sparkles className="w-4 h-4 text-black" />
          </div>
        </motion.div>
        
        <div className="flex flex-col items-center pt-4">
          <motion.div
            className="relative mb-4"
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity }}
          >
            <motion.div
              className="absolute -inset-3 rounded-full bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-400"
              animate={{
                rotate: 360,
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              style={{ padding: 3 }}
            />
            <Avatar className="w-24 h-24 border-4 border-black relative z-10">
              <AvatarImage src={avatarUrl} alt={name} />
              <AvatarFallback className="bg-yellow-500/20 text-yellow-400 text-2xl font-bold">
                {name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <motion.div
              className="absolute -inset-6 rounded-full border border-yellow-500/30"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 0, 0.5],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </motion.div>
          
          <motion.h3
            className="text-2xl font-display font-bold text-white mb-1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {name}
          </motion.h3>
          
          <motion.p
            className="text-xs font-mono text-muted-foreground mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            {shortenWallet(walletAddress)}
          </motion.p>
          
          <motion.div
            className="bg-gradient-to-r from-yellow-500/10 via-yellow-500/20 to-yellow-500/10 rounded-xl p-4 w-full text-center border border-yellow-500/20"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className="text-[10px] font-tech text-yellow-500/60 uppercase tracking-[0.3em] mb-1">
              Prize Claimed
            </div>
            <div className="text-3xl font-mono font-black text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.5)]">
              {prizeAmount.toFixed(2)} {tokenSymbol}
            </div>
          </motion.div>
          
          {txHash && (
            <motion.a
              href={getSolscanUrl(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center gap-2 text-xs font-tech text-primary/60 hover:text-primary transition-colors"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              <span>View Transaction</span>
              <ExternalLink className="w-3 h-3" />
            </motion.a>
          )}
        </div>
        
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-yellow-400 rounded-full"
            style={{
              left: `${20 + Math.random() * 60}%`,
              top: `${20 + Math.random() * 60}%`,
            }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1, 0],
              y: [0, -20, -40],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.3,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
