import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gift, Users, Coins, Copy, Check, Loader2, Wallet } from "lucide-react";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import bs58 from "bs58";

interface ReferralStats {
  totalInvited: number;
  totalEarned: string;
  totalClaimed: string;
}

interface ReferralReward {
  id: number;
  referrerWallet: string;
  tokenMint: string;
  amountPending: string;
  amountClaimed: string;
  lastUpdated: string;
}

interface InvitedUser {
  id: number;
  referredWallet: string;
  referrerWallet: string;
  source: string;
  createdAt: string;
}

export default function Referrals() {
  const { connected, publicKey, signMessage } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [claimingMint, setClaimingMint] = useState<string | null>(null);
  const walletAddress = publicKey?.toBase58() || "";

  const { data: linkData } = useQuery({
    queryKey: ["referralLink", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      const res = await fetch(`/api/referrals/link/${walletAddress}`);
      return res.json();
    },
    enabled: !!walletAddress,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<ReferralStats>({
    queryKey: ["referralStats", walletAddress],
    queryFn: async () => {
      const res = await fetch(`/api/referrals/summary/${walletAddress}`);
      return res.json();
    },
    enabled: !!walletAddress,
  });

  const { data: rewards, isLoading: rewardsLoading } = useQuery<ReferralReward[]>({
    queryKey: ["referralRewards", walletAddress],
    queryFn: async () => {
      const res = await fetch(`/api/referrals/rewards/${walletAddress}`);
      return res.json();
    },
    enabled: !!walletAddress,
  });

  const { data: invitedUsers } = useQuery<InvitedUser[]>({
    queryKey: ["invitedUsers", walletAddress],
    queryFn: async () => {
      const res = await fetch(`/api/referrals/invited/${walletAddress}`);
      return res.json();
    },
    enabled: !!walletAddress,
  });

  const handleClaim = async (tokenMint: string) => {
    if (!signMessage || !publicKey) {
      toast({ variant: "destructive", title: "Error", description: "Wallet does not support message signing" });
      return;
    }
    
    setClaimingMint(tokenMint);
    
    try {
      const timestamp = Date.now();
      const message = `Claim referral rewards for ${tokenMint} at ${timestamp}`;
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);
      
      const res = await fetch("/api/referrals/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress, tokenMint, signature, message }),
      });
      const data = await res.json();
      
      if (data.success) {
        toast({ title: "Claim Initiated", description: data.message });
        queryClient.invalidateQueries({ queryKey: ["referralRewards"] });
        queryClient.invalidateQueries({ queryKey: ["referralStats"] });
      } else {
        toast({ variant: "destructive", title: "Claim Failed", description: data.message });
      }
    } catch (err: any) {
      console.error("[Referral] Claim error:", err);
      toast({ variant: "destructive", title: "Claim Failed", description: err.message || "Failed to sign message" });
    } finally {
      setClaimingMint(null);
    }
  };

  const referralLink = linkData?.link || `${window.location.origin}?ref=${walletAddress}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast({ title: "Copied!", description: "Referral link copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const shortenWallet = (wallet: string) => `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;

  const formatTokenAmount = (amount: string, decimals: number = 9) => {
    const value = BigInt(amount);
    const divisor = BigInt(10 ** decimals);
    const whole = value / divisor;
    const fraction = value % divisor;
    return `${whole}.${fraction.toString().padStart(decimals, "0").slice(0, 4)}`;
  };

  const pendingRewards = rewards?.filter((r) => BigInt(r.amountPending || "0") > BigInt(0)) || [];

  return (
    <div className="min-h-screen bg-grid-pattern flex flex-col">
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Gift className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-black text-white tracking-tight">
              REFERRAL <span className="text-primary text-neon-cyan">REWARDS</span>
            </h1>
            <p className="text-muted-foreground font-tech text-sm">
              Invite friends, earn 1.5% of every pool they join
            </p>
          </div>
        </div>

        {!connected ? (
          <Card className="bg-card/50 border-white/10">
            <CardContent className="py-12 text-center">
              <Wallet className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="font-tech text-muted-foreground">Connect your wallet to view referrals</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
              <Card className="bg-card/50 border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="font-tech text-sm text-muted-foreground flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Invited Users
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-display font-black text-white">
                    {statsLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : stats?.totalInvited || 0}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="font-tech text-sm text-muted-foreground flex items-center gap-2">
                    <Coins className="w-4 h-4" />
                    Total Earned
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-display font-black text-primary">
                    {statsLoading ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      formatTokenAmount(stats?.totalEarned || "0")
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">tokens earned</p>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="font-tech text-sm text-muted-foreground flex items-center gap-2">
                    <Gift className="w-4 h-4" />
                    Claimed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-display font-black text-green-400">
                    {statsLoading ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      formatTokenAmount(stats?.totalClaimed || "0")
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">tokens claimed</p>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-card/50 border-white/10">
              <CardHeader>
                <CardTitle className="font-tech text-lg">Your Referral Link</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <div className="flex-1 bg-white/5 border border-white/10 rounded-md px-4 py-2 font-mono text-sm text-muted-foreground truncate">
                    {referralLink}
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleCopy}
                    className="shrink-0"
                    data-testid="button-copy-referral"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Share this link with friends. Earn 1.5% of every pool they participate in.
                </p>
              </CardContent>
            </Card>

            {pendingRewards.length > 0 && (
              <Card className="bg-card/50 border-white/10">
                <CardHeader>
                  <CardTitle className="font-tech text-lg flex items-center gap-2">
                    <Gift className="w-5 h-5 text-primary" />
                    Pending Rewards
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {pendingRewards.map((reward) => (
                      <div
                        key={reward.id}
                        className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
                      >
                        <div>
                          <p className="font-mono text-sm text-white">
                            {shortenWallet(reward.tokenMint)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTokenAmount(reward.amountPending)} pending
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleClaim(reward.tokenMint)}
                          disabled={claimingMint !== null}
                          className="bg-primary text-black hover:bg-primary/80"
                        >
                          {claimingMint === reward.tokenMint ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Claim"
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {invitedUsers && invitedUsers.length > 0 && (
              <Card className="bg-card/50 border-white/10">
                <CardHeader>
                  <CardTitle className="font-tech text-lg flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Invited Users ({invitedUsers.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {invitedUsers.slice(0, 10).map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-2 bg-white/5 rounded-lg"
                      >
                        <span className="font-mono text-sm text-muted-foreground">
                          {shortenWallet(user.referredWallet)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
