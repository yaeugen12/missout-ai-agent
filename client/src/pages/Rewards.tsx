import { useLeaderboard } from "@/hooks/use-leaderboard";
import { Navbar } from "@/components/Navbar";
import { Loader2, Medal, Trophy, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Rewards() {
  const { data, isLoading } = useLeaderboard();

  return (
    <div className="min-h-screen bg-black bg-grid-pattern">
      <main className="container mx-auto px-4 py-12">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-display font-black text-white mb-4 tracking-tight">
            HALL OF <span className="text-primary text-neon-cyan">MISSOUT</span>
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            The top entities who have escaped the void.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center"><Loader2 className="animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-5xl mx-auto">
            
            {/* Top Winners */}
            <div className="bg-zinc-900/30 border border-white/10 rounded-lg p-6 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-8 border-b border-white/10 pb-4">
                <Trophy className="w-6 h-6 text-yellow-500" />
                <h2 className="text-xl font-display font-bold">TOP EARNERS</h2>
              </div>
              
              <div className="space-y-4">
                {data?.topWinners.map((winner, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-black/40 rounded border border-white/5 hover:border-primary/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-8 h-8 flex items-center justify-center font-bold font-mono rounded",
                        i === 0 ? "bg-yellow-500 text-black" : 
                        i === 1 ? "bg-gray-400 text-black" :
                        i === 2 ? "bg-orange-700 text-white" : "bg-white/10 text-muted-foreground"
                      )}>
                        #{i + 1}
                      </div>
                      <div className="font-mono text-sm">{winner.wallet}</div>
                    </div>
                    <div className="font-bold text-primary">
                      {winner.totalWon} SOL
                    </div>
                  </div>
                ))}
                {data?.topWinners.length === 0 && <div className="text-center text-muted-foreground py-8">No winners yet</div>}
              </div>
            </div>

            {/* Top Referrers */}
            <div className="bg-zinc-900/30 border border-white/10 rounded-lg p-6 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-8 border-b border-white/10 pb-4">
                <Star className="w-6 h-6 text-purple-500" />
                <h2 className="text-xl font-display font-bold">TOP REFERRERS</h2>
              </div>
              
              <div className="space-y-4">
                {data?.topReferrers.map((ref, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-black/40 rounded border border-white/5 hover:border-purple-500/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 flex items-center justify-center font-bold font-mono rounded bg-white/10 text-muted-foreground">
                        #{i + 1}
                      </div>
                      <div className="font-mono text-sm">{ref.wallet}</div>
                    </div>
                    <div className="font-bold text-purple-400">
                      {ref.referrals} Refs
                    </div>
                  </div>
                ))}
                {data?.topReferrers.length === 0 && <div className="text-center text-muted-foreground py-8">No referrals yet</div>}
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
