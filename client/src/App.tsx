import React, { Suspense } from "react";
import { Switch, Route } from "wouter";
import { Analytics } from "@vercel/analytics/react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletProvider } from "@/components/WalletProvider";
import { NotificationProvider } from "@/hooks/useNotifications";
import { initConnection } from "./lib/solana-sdk/connection";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { WinnersFeed } from "@/components/WinnersFeed";
import { useReferralCapture } from "@/hooks/useReferralCapture";
import { useWebSocketNotifications } from "@/hooks/useWebSocketNotifications";

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
import ExternalRedirect from "@/pages/ExternalRedirect";

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
      <Route path="/blog">
        {() => (
          <ExternalRedirect
            url="https://medium.com/@ya.eugen12/missout-turning-meme-coin-volatility-into-a-game-you-can-actually-win-2ad228edffe8"
            name="Medium"
          />
        )}
      </Route>
      <Route path="/socials">
        {() => (
          <ExternalRedirect
            url="https://x.com/missout_fun"
            name="X"
          />
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function ReferralCaptureWrapper({ children }: { children: React.ReactNode }) {
  useReferralCapture();
  useWebSocketNotifications(); // Connect to WebSocket for real-time notifications
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WalletProvider>
          <NotificationProvider>
            <ReferralCaptureWrapper>
              <div className="min-h-screen bg-black text-white selection:bg-primary/30 flex flex-col">
                <Navbar />
                <WinnersFeed />
                <main className="flex-1">
                  <Router />
                </main>
                <Footer />
                <Toaster />
                <Analytics />
              </div>
            </ReferralCaptureWrapper>
          </NotificationProvider>
        </WalletProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
