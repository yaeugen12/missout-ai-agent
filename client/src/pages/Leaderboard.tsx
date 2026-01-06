import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Users, Coins } from "lucide-react";

export default function Leaderboard() {
  return (
    <div className="min-h-screen bg-grid-pattern flex flex-col">
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Trophy className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-black text-white tracking-tight">
              LEADER<span className="text-primary text-neon-cyan">BOARD</span>
            </h1>
            <p className="text-muted-foreground font-tech text-sm">
              Top performers in the void
            </p>
          </div>
        </div>

        <Tabs defaultValue="winners" className="space-y-4">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="winners" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary" data-testid="tab-top-winners">
              <Trophy className="w-4 h-4 mr-2" />
              Top Winners
            </TabsTrigger>
            <TabsTrigger value="referrers" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary" data-testid="tab-top-referrers">
              <Users className="w-4 h-4 mr-2" />
              Top Referrers
            </TabsTrigger>
            <TabsTrigger value="pools" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary" data-testid="tab-biggest-pools">
              <Coins className="w-4 h-4 mr-2" />
              Biggest Pools
            </TabsTrigger>
          </TabsList>

          <TabsContent value="winners">
            <Card className="bg-card/50 border-white/10">
              <CardHeader>
                <CardTitle className="font-tech text-lg">Top Winners</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="font-tech">Leaderboard data coming soon</p>
                  <p className="text-sm mt-1">Winners will be displayed here once pools complete</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="referrers">
            <Card className="bg-card/50 border-white/10">
              <CardHeader>
                <CardTitle className="font-tech text-lg">Top Referrers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="font-tech">Referral rankings coming soon</p>
                  <p className="text-sm mt-1">Top referrers will be displayed here</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pools">
            <Card className="bg-card/50 border-white/10">
              <CardHeader>
                <CardTitle className="font-tech text-lg">Biggest Pools</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <Coins className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="font-tech">Pool rankings coming soon</p>
                  <p className="text-sm mt-1">Largest pools will be displayed here</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
