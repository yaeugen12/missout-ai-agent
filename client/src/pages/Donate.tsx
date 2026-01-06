import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Info } from "lucide-react";

export default function Donate() {
  return (
    <div className="min-h-screen bg-grid-pattern flex flex-col">
      <Navbar />
      
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Heart className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-black text-white tracking-tight">
              DONATE TO <span className="text-primary text-neon-cyan">POOLS</span>
            </h1>
            <p className="text-muted-foreground font-tech text-sm">
              Feed the void, support the game
            </p>
          </div>
        </div>

        <Card className="bg-card/50 border-white/10 mb-6">
          <CardHeader>
            <CardTitle className="font-tech text-lg flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" />
              How Donations Work
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-2">
            <p>Donations increase the pool prize without entering the lottery.</p>
            <p>Donors gain visibility and support pools they believe in.</p>
            <p>All donations go directly to the winner's pot.</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-white/10">
          <CardHeader>
            <CardTitle className="font-tech text-lg">Pools Accepting Donations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <Heart className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="font-tech">Donation feature coming soon</p>
              <p className="text-sm mt-1">Active pools accepting donations will appear here</p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
