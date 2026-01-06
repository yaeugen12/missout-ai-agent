import { Navbar } from "@/components/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { HelpCircle, Atom, Users, Trophy, ArrowRight } from "lucide-react";

export default function HowItWorks() {
  const steps = [
    {
      icon: Atom,
      title: "Initialize a Black Hole",
      description: "Create a new lottery pool by selecting a token, entry amount, and participant limits. Set the rules for your cosmic game."
    },
    {
      icon: Users,
      title: "Get Pulled In",
      description: "Players join the pool by staking the entry amount. Once the minimum participants join, the countdown begins."
    },
    {
      icon: Trophy,
      title: "Escape the Void",
      description: "When the pool locks, a random winner is selected on-chain. The winner takes all - escaping the black hole with the entire pot."
    }
  ];

  return (
    <div className="min-h-screen bg-grid-pattern flex flex-col">
      <Navbar />
      
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <HelpCircle className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-black text-white tracking-tight">
              HOW IT <span className="text-primary text-neon-cyan">WORKS</span>
            </h1>
            <p className="text-muted-foreground font-tech text-sm">
              Enter the void, escape with everything
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          {steps.map((step, index) => (
            <div key={step.title} className="relative">
              <Card className="bg-card/50 border-white/10 h-full">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                      <step.icon className="w-6 h-6 text-primary" />
                    </div>
                    <div className="text-4xl font-display font-black text-white/10">
                      {index + 1}
                    </div>
                  </div>
                  <h3 className="font-display font-bold text-lg text-white mb-2">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
              {index < steps.length - 1 && (
                <div className="hidden md:flex absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                  <ArrowRight className="w-6 h-6 text-primary/50" />
                </div>
              )}
            </div>
          ))}
        </div>

        <Card className="bg-card/50 border-white/10">
          <CardContent className="py-6">
            <h3 className="font-display font-bold text-lg text-white mb-4">
              Key Terminology
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="font-tech text-primary">Black Hole</div>
                <div className="text-sm text-muted-foreground">A lottery pool where players stake tokens</div>
              </div>
              <div className="space-y-1">
                <div className="font-tech text-primary">Get Pulled In</div>
                <div className="text-sm text-muted-foreground">Join a pool by staking the entry amount</div>
              </div>
              <div className="space-y-1">
                <div className="font-tech text-primary">Feed the Void</div>
                <div className="text-sm text-muted-foreground">Donate to a pool without entering the lottery</div>
              </div>
              <div className="space-y-1">
                <div className="font-tech text-primary">Escape the Void</div>
                <div className="text-sm text-muted-foreground">Win the pool and claim all staked tokens</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
