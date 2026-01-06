import React from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletProvider } from "@/components/WalletProvider";
import { initConnection } from "./lib/solana-sdk/connection";

// Initialize connection as early as possible
initConnection().catch(console.error);

import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import PoolDetails from "@/pages/PoolDetails";
import CreatePool from "@/pages/CreatePool";
import Rewards from "@/pages/Rewards";
import Terminal from "@/pages/Terminal";
import Leaderboard from "@/pages/Leaderboard";
import Referrals from "@/pages/Referrals";
import Donate from "@/pages/Donate";
import HowItWorks from "@/pages/HowItWorks";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/terminal" component={Home} />
      <Route path="/pool/:id" component={PoolDetails} />
      <Route path="/initialize" component={CreatePool} />
      <Route path="/rewards" component={Rewards} />
      <Route path="/discovery" component={Terminal} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/referrals" component={Referrals} />
      <Route path="/donate" component={Donate} />
      <Route path="/how-it-works" component={HowItWorks} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <WalletProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </WalletProvider>
  );
}

export default App;
