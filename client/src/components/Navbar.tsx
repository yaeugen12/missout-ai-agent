import { Link, useLocation } from "wouter";
import { useWallet } from "@/hooks/use-wallet";
import { useWalletBalances } from "@/hooks/use-wallet-balances";
import { Button } from "@/components/ui/button";
import { Wallet, Plus, Trophy, Atom, Terminal, ChevronDown, Loader2, RefreshCw, LogOut, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlobalMenu } from "@/components/GlobalMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";

export function Navbar() {
  const [location] = useLocation();
  const { isConnected, address, connect, disconnect, isConnecting, publicKey } = useWallet();
  const { solBalance, tokens, isLoading, refresh } = useWalletBalances();
  const [copied, setCopied] = useState(false);

  const navItems = [
    { href: "/terminal", label: "Pool Terminal", icon: Atom },
    { href: "/discovery", label: "Discovery", icon: Terminal },
    { href: "/initialize", label: "Initialize", icon: Plus },
    { href: "/rewards", label: "Rewards", icon: Trophy },
  ];

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatBalance = (balance: number) => {
    if (balance >= 1000000) return (balance / 1000000).toFixed(2) + "M";
    if (balance >= 1000) return (balance / 1000).toFixed(2) + "K";
    if (balance >= 1) return balance.toFixed(4);
    return balance.toFixed(6);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center">
            <GlobalMenu />
            <Link href="/" className="group flex items-center gap-2">
              <div className="relative">
                <div className="absolute inset-0 bg-primary blur opacity-50 group-hover:opacity-100 transition-opacity" />
                <div className="relative h-8 w-8 bg-black border border-primary flex items-center justify-center">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                </div>
              </div>
              <span className="text-xl font-display font-bold text-white tracking-widest group-hover:text-primary transition-colors">
                MISSOUT
              </span>
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href} className={cn(
                  "px-4 py-2 flex items-center gap-2 font-tech font-bold uppercase tracking-wide text-sm transition-all duration-300",
                  isActive 
                    ? "text-primary border-b-2 border-primary bg-primary/5" 
                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                )}>
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {isConnected && address ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost"
                  className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-sm hover:bg-white/10"
                  data-testid="button-wallet-dropdown"
                >
                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                  <div className="flex flex-col items-start">
                    <span className="text-[10px] text-muted-foreground font-mono uppercase">
                      {solBalance !== null ? `${solBalance.toFixed(4)} SOL` : "..."}
                    </span>
                    <span className="text-xs font-mono text-primary font-bold">
                      {address.slice(0, 4)}...{address.slice(-4)}
                    </span>
                  </div>
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="end" 
                className="w-80 bg-black/95 border-white/10"
                data-testid="dropdown-wallet-content"
              >
                <DropdownMenuLabel className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">
                    {address.slice(0, 8)}...{address.slice(-8)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={copyAddress}
                      data-testid="button-copy-address"
                    >
                      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={refresh}
                      disabled={isLoading}
                      data-testid="button-refresh-balances"
                    >
                      <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
                    </Button>
                  </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator className="bg-white/10" />

                <div className="p-3">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono text-muted-foreground uppercase">SOL Balance</span>
                    <span className="text-lg font-mono font-bold text-white" data-testid="text-sol-balance">
                      {solBalance !== null ? `${solBalance.toFixed(4)} SOL` : "—"}
                    </span>
                  </div>
                </div>

                <DropdownMenuSeparator className="bg-white/10" />

                <DropdownMenuLabel className="text-xs font-mono text-muted-foreground uppercase flex items-center justify-between">
                  <span>SPL Tokens ({tokens.length})</span>
                  {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                </DropdownMenuLabel>

                <ScrollArea className="h-48">
                  {tokens.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      {isLoading ? "Loading tokens..." : "No SPL tokens found"}
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
                      {tokens.map((token) => (
                        <div 
                          key={token.mint}
                          className="flex items-center gap-3 p-2 rounded-md hover:bg-white/5"
                          data-testid={`token-item-${token.mint}`}
                        >
                          {token.logoUrl ? (
                            <img 
                              src={token.logoUrl} 
                              alt={token.symbol} 
                              className="w-6 h-6 rounded-full"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                              <span className="text-[10px] font-bold text-primary">
                                {token.symbol.slice(0, 2)}
                              </span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-mono font-bold text-white truncate">
                              {token.symbol}
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground truncate">
                              {token.mint.slice(0, 4)}...{token.mint.slice(-4)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-mono text-white">
                              {formatBalance(token.balance)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>

                <DropdownMenuSeparator className="bg-white/10" />

                <DropdownMenuItem 
                  onClick={disconnect}
                  className="text-destructive focus:text-destructive cursor-pointer"
                  data-testid="button-disconnect"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Disconnect Wallet
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button 
              onClick={connect}
              disabled={isConnecting}
              className="bg-primary/10 text-primary border border-primary/50 hover:bg-primary hover:text-black hover:shadow-[0_0_20px_rgba(0,240,255,0.4)] transition-all font-tech font-bold uppercase tracking-wider"
              data-testid="button-connect-wallet"
            >
              {isConnecting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wallet className="w-4 h-4 mr-2" />
              )}
              Connect Wallet
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
