import { useTopWinners, useTopReferrers, TopWinner, TopReferrer } from "@/hooks/use-leaderboard";
import { useWallet } from "@/hooks/use-wallet";
import { useProfile, generateDicebearUrl, shortenWallet } from "@/hooks/use-profile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Trophy, Users, Loader2, Crown, Star, Sparkles, Gift, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

function formatTokenAmount(amount: number, decimals: number = 4) {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(2)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(2)}K`;
  return amount.toFixed(decimals);
}

function LeaderboardAvatar({ wallet, isTop3 }: { wallet: string; isTop3: boolean }) {
  const { data: profile, isLoading } = useProfile(wallet);
  
  const displayAvatar = profile?.displayAvatar || generateDicebearUrl(wallet);
  const displayName = profile?.displayName || shortenWallet(wallet);
  
  if (isLoading) {
    return (
      <Avatar className={cn("h-10 w-10 border-2 animate-pulse", isTop3 ? "border-white/30" : "border-white/10")}>
        <AvatarFallback className="bg-primary/10 text-primary text-xs">
          {wallet.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
    );
  }
  
  return (
    <Avatar className={cn("h-10 w-10 border-2", isTop3 ? "border-white/30" : "border-white/10")}>
      <AvatarImage src={displayAvatar} alt={displayName} />
      <AvatarFallback className="bg-primary/10 text-primary text-xs">
        {displayName.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function LeaderboardName({ wallet, isTop3, isCurrentUser }: { wallet: string; isTop3: boolean; isCurrentUser: boolean }) {
  const { data: profile, isLoading } = useProfile(wallet);
  
  const displayName = profile?.displayName || shortenWallet(wallet);
  
  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <span className={cn("font-mono text-sm animate-pulse", isTop3 ? "text-white font-bold" : "text-muted-foreground")}>
          {shortenWallet(wallet)}
        </span>
        {isCurrentUser && (
          <span className="px-2 py-0.5 text-[10px] font-tech uppercase bg-primary/20 text-primary rounded-full">
            You
          </span>
        )}
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2">
      <span className={cn("text-sm truncate max-w-[140px]", isTop3 ? "text-white font-bold" : "text-muted-foreground")}>
        {displayName}
      </span>
      {isCurrentUser && (
        <span className="px-2 py-0.5 text-[10px] font-tech uppercase bg-primary/20 text-primary rounded-full">
          You
        </span>
      )}
    </div>
  );
}

interface LeaderboardRowProps {
  rank: number;
  wallet: string;
  isCurrentUser: boolean;
  children: React.ReactNode;
  accentColor?: "gold" | "purple";
}

function LeaderboardRow({ rank, wallet, isCurrentUser, children, accentColor = "gold" }: LeaderboardRowProps) {
  const isTop3 = rank <= 3;
  const rankColors = {
    1: "bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border-yellow-500/50 shadow-[0_0_30px_rgba(234,179,8,0.3)]",
    2: "bg-gradient-to-r from-gray-400/20 to-slate-400/20 border-gray-400/40 shadow-[0_0_20px_rgba(156,163,175,0.2)]",
    3: "bg-gradient-to-r from-orange-600/20 to-amber-600/20 border-orange-500/40 shadow-[0_0_15px_rgba(234,88,12,0.2)]",
  };

  const rankBadgeColors = {
    1: "bg-gradient-to-br from-yellow-400 to-amber-600 text-black shadow-[0_0_20px_rgba(234,179,8,0.5)]",
    2: "bg-gradient-to-br from-gray-300 to-slate-500 text-black shadow-[0_0_15px_rgba(156,163,175,0.4)]",
    3: "bg-gradient-to-br from-orange-400 to-amber-700 text-white shadow-[0_0_10px_rgba(234,88,12,0.3)]",
  };

  return (
    <div
      className={cn(
        "relative flex items-center gap-4 p-4 rounded-lg border transition-all duration-300 group",
        isTop3 ? rankColors[rank as 1 | 2 | 3] : "bg-black/40 border-white/10 hover:border-white/20",
        isCurrentUser && "ring-2 ring-primary/50"
      )}
    >
      {isTop3 && (
        <div className="absolute -top-1 -right-1">
          {rank === 1 && <Crown className="w-5 h-5 text-yellow-400 animate-pulse" />}
          {rank === 2 && <Star className="w-4 h-4 text-gray-400" />}
          {rank === 3 && <Sparkles className="w-4 h-4 text-orange-400" />}
        </div>
      )}

      <div
        className={cn(
          "w-10 h-10 flex items-center justify-center font-bold font-mono rounded-lg text-sm",
          isTop3 ? rankBadgeColors[rank as 1 | 2 | 3] : "bg-white/10 text-muted-foreground"
        )}
      >
        #{rank}
      </div>

      <LeaderboardAvatar wallet={wallet} isTop3={isTop3} />

      <div className="flex-1 min-w-0">
        <LeaderboardName wallet={wallet} isTop3={isTop3} isCurrentUser={isCurrentUser} />
      </div>

      {children}
    </div>
  );
}

function WinnersLeaderboard({ winners, currentWallet }: { winners: TopWinner[]; currentWallet: string | undefined }) {
  if (winners.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Trophy className="w-16 h-16 mx-auto mb-4 opacity-30" />
        <p className="font-tech text-lg">No winners yet</p>
        <p className="text-sm mt-2 opacity-70">Be the first to escape the void!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {winners.map((winner, idx) => (
        <LeaderboardRow
          key={`${winner.wallet}-${idx}`}
          rank={idx + 1}
          wallet={winner.wallet}
          isCurrentUser={currentWallet === winner.wallet}
          accentColor="gold"
        >
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-muted-foreground font-tech uppercase">Wins</div>
              <div className="text-lg font-bold text-yellow-400">{winner.winsCount}</div>
            </div>
            <div className="text-right min-w-[100px]">
              <div className="text-xs text-muted-foreground font-tech uppercase">Total Won</div>
              <div className="text-lg font-bold text-primary">
                {formatTokenAmount(winner.totalTokensWon)}
                {winner.tokenSymbol && (
                  <span className="text-xs text-muted-foreground ml-1">{winner.tokenSymbol}</span>
                )}
              </div>
            </div>
            {winner.lastWinAt && (
              <div className="text-right hidden md:block min-w-[80px]">
                <div className="text-xs text-muted-foreground font-tech uppercase">Last Win</div>
                <div className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(winner.lastWinAt), { addSuffix: true })}
                </div>
              </div>
            )}
          </div>
        </LeaderboardRow>
      ))}
    </div>
  );
}

function ReferrersLeaderboard({ referrers, currentWallet }: { referrers: TopReferrer[]; currentWallet: string | undefined }) {
  if (referrers.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Users className="w-16 h-16 mx-auto mb-4 opacity-30" />
        <p className="font-tech text-lg">No referrers yet</p>
        <p className="text-sm mt-2 opacity-70">Share your referral link to climb the ranks!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {referrers.map((referrer, idx) => (
        <LeaderboardRow
          key={`${referrer.wallet}-${idx}`}
          rank={idx + 1}
          wallet={referrer.wallet}
          isCurrentUser={currentWallet === referrer.wallet}
          accentColor="purple"
        >
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-muted-foreground font-tech uppercase">Referrals</div>
              <div className="text-lg font-bold text-purple-400">{referrer.referralsCount}</div>
            </div>
            <div className="text-right min-w-[100px]">
              <div className="text-xs text-muted-foreground font-tech uppercase">Earned</div>
              <div className="text-lg font-bold text-primary">
                {formatTokenAmount(referrer.totalTokensEarned)}
              </div>
            </div>
            {referrer.lastReferralAt && (
              <div className="text-right hidden md:block min-w-[80px]">
                <div className="text-xs text-muted-foreground font-tech uppercase">Latest</div>
                <div className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(referrer.lastReferralAt), { addSuffix: true })}
                </div>
              </div>
            )}
          </div>
        </LeaderboardRow>
      ))}
    </div>
  );
}

export default function Leaderboard() {
  const { address } = useWallet();
  const { data: winners, isLoading: loadingWinners } = useTopWinners(20);
  const { data: referrers, isLoading: loadingReferrers } = useTopReferrers(20);

  return (
    <div className="min-h-screen bg-black bg-grid-pattern">
      <main className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-display font-black text-white mb-4 tracking-tight">
            LEADER<span className="text-primary text-neon-cyan">BOARD</span>
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            The elite entities who have conquered the void and risen through the cosmic ranks.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <Tabs defaultValue="winners" className="space-y-6">
            <TabsList className="w-full grid grid-cols-2 bg-zinc-900/50 border border-white/10 h-14 p-1">
              <TabsTrigger
                value="winners"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-yellow-500/20 data-[state=active]:to-amber-500/20 data-[state=active]:text-yellow-400 data-[state=active]:border-yellow-500/30 font-tech uppercase tracking-wider text-sm flex items-center gap-2 h-full"
                data-testid="tab-top-winners"
              >
                <Trophy className="w-5 h-5" />
                Top Winners
                {winners && winners.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 text-[10px] bg-yellow-500/20 rounded-full">
                    {winners.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="referrers"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500/20 data-[state=active]:to-violet-500/20 data-[state=active]:text-purple-400 data-[state=active]:border-purple-500/30 font-tech uppercase tracking-wider text-sm flex items-center gap-2 h-full"
                data-testid="tab-top-referrers"
              >
                <Gift className="w-5 h-5" />
                Top Referrers
                {referrers && referrers.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 text-[10px] bg-purple-500/20 rounded-full">
                    {referrers.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="winners" className="mt-0">
              <div className="bg-zinc-900/30 border border-yellow-500/20 rounded-lg p-6 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-6 border-b border-yellow-500/20 pb-4">
                  <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <Trophy className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-display font-bold text-yellow-400">Void Escapees</h2>
                    <p className="text-xs text-muted-foreground font-tech">Those who conquered the singularity</p>
                  </div>
                </div>

                {loadingWinners ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
                  </div>
                ) : (
                  <WinnersLeaderboard winners={winners || []} currentWallet={address} />
                )}
              </div>
            </TabsContent>

            <TabsContent value="referrers" className="mt-0">
              <div className="bg-zinc-900/30 border border-purple-500/20 rounded-lg p-6 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-6 border-b border-purple-500/20 pb-4">
                  <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <TrendingUp className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-display font-bold text-purple-400">Cosmic Influencers</h2>
                    <p className="text-xs text-muted-foreground font-tech">Gravitational pull masters</p>
                  </div>
                </div>

                {loadingReferrers ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                  </div>
                ) : (
                  <ReferrersLeaderboard referrers={referrers || []} currentWallet={address} />
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
