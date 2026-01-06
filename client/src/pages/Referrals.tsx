import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gift, Users, Coins, Copy, Check } from "lucide-react";
import { useState } from "react";
import { useWallet } from "@/hooks/use-wallet";

export default function Referrals() {
  const { isConnected, address } = useWallet();
  const [copied, setCopied] = useState(false);

  const referralLink = address 
    ? `${window.location.origin}?ref=${address.slice(0, 8)}`
    : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-grid-pattern flex flex-col">
      <Navbar />
      
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
              Invite friends, earn rewards
            </p>
          </div>
        </div>

        {!isConnected ? (
          <Card className="bg-card/50 border-white/10">
            <CardContent className="py-12 text-center">
              <Gift className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="font-tech text-muted-foreground">Connect your wallet to view referrals</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="bg-card/50 border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="font-tech text-sm text-muted-foreground flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Invited Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-display font-black text-white">0</div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="font-tech text-sm text-muted-foreground flex items-center gap-2">
                  <Coins className="w-4 h-4" />
                  Total Earnings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-display font-black text-primary">0 SOL</div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="font-tech text-sm text-muted-foreground flex items-center gap-2">
                  <Gift className="w-4 h-4" />
                  Pending Rewards
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-display font-black text-white">0 SOL</div>
              </CardContent>
            </Card>

            <Card className="md:col-span-3 bg-card/50 border-white/10">
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
                  Share this link with friends. Earn rewards when they join pools.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
