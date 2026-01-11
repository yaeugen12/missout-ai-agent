import React, { Suspense } from "react";
import { Switch, Route } from "wouter";
import { Analytics } from "@vercel/analytics/react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletProvider } from "@/components/WalletProvider";
import { initConnection } from "./lib/solana-sdk/connection";
import { Navbar } from "@/components/Navbar";
import { useReferralCapture } from "@/hooks/useReferralCapture";

// Initialize connection as early as possible
initConnection().catch(console.error);

import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import PoolDetails from "@/pages/PoolDetails";
import CreatePool from "@/pages/CreatePool";
import Terminal from "@/pages/Terminal";
import Leaderboard from "@/pages/Leaderboard";
import Referrals from "@/pages/Referrals";
import Donate from "@/pages/Donate";
import HowItWorks from "@/pages/HowItWorks";
import Claims from "@/pages/Claims";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/terminal" component={Home} />
      <Route path="/pool/:id" component={PoolDetails} />
      <Route path="/initialize" component={CreatePool} />
      <Route path="/rewards" component={Leaderboard} />
      <Route path="/discovery" component={Terminal} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/referrals" component={Referrals} />
      <Route path="/donate" component={Donate} />
      <Route path="/how-it-works" component={HowItWorks} />
      <Route path="/claims" component={Claims} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ReferralCaptureWrapper({ children }: { children: React.ReactNode }) {
  useReferralCapture();
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WalletProvider>
          <ReferralCaptureWrapper>
            <div className="min-h-screen bg-black text-white selection:bg-primary/30">
              <Navbar />
              <main className="container mx-auto px-4 py-8">
                <Router />
              </main>
              <Toaster />
              <Analytics />
            </div>
          </ReferralCaptureWrapper>
        </WalletProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
