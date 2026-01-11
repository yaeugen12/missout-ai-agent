import { Link, useLocation } from "wouter";
import { useWallet } from "@/hooks/use-wallet";
import { useWalletBalances } from "@/hooks/use-wallet-balances";
import { useMyProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Wallet, Plus, Trophy, Atom, Terminal, ChevronDown, Loader2, LogOut, Copy, Check, UserCircle, History, Droplets } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlobalMenu } from "@/components/GlobalMenu";
import { ProfileEditModal } from "@/components/ProfileEditModal";
import { TransactionHistory } from "@/components/TransactionHistory";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";
import { toast } from "sonner";

export function Navbar() {
  const [location] = useLocation();
  const { isConnected, address, connect, disconnect, isConnecting, publicKey } = useWallet();
  const { solBalance, tokens, isLoading, refresh } = useWalletBalances();
  const { data: profile } = useMyProfile();
  const [copied, setCopied] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const navItems = [
    { href: "/initialize", label: "Initialize", icon: Plus },
    { href: "/terminal", label: "Pool Terminal", icon: Atom },
    { href: "/discovery", label: "Discovery (V2-soon)", icon: Terminal },
    { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
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

  // 🚀 Faucet HNCZ — adăugat fără să schimb nimic altceva
  const handleFaucet = async () => {
    if (!publicKey) return toast.error("Connect your wallet first!");

    try {
      toast.loading("Requesting HNCZ...");

      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/faucet/hncz?wallet=${publicKey.toString()}`,
        { method: "POST" }
      );

      const data = await res.json();
      toast.dismiss();

      if (!res.ok) return toast.error(data.message || "Faucet failed");

      toast.success(data.message || "HNCZ sent!");
      refresh();
    } catch {
      toast.dismiss();
      toast.error("Network error");
    }
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
                <div className="relative h-8 w-8 bg-black border border-primary flex items-center justify-center overflow-hidden">
                  <div className="w-full h-full bg-[radial-gradient(circle,rgba(0,243,255,0.4)_0%,transparent_70%)] animate-pulse" />
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
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-4 py-2 flex items-center gap-2 font-tech font-bold uppercase tracking-wide text-sm transition-all duration-300",
                    isActive
                      ? "text-primary border-b-2 border-primary bg-primary/5"
                      : "text-muted-foreground hover:text-white hover:bg-white/5"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {/* ⭐ Faucet button added — no other UI changes */}
          {isConnected && (
            <Button
              onClick={handleFaucet}
              className="bg-primary/10 text-primary border border-primary/50 hover:bg-primary hover:text-black transition-all font-tech font-bold uppercase tracking-wider flex items-center gap-2"
            >
              <Droplets className="w-4 h-4" />
              Get HNCZ
            </Button>
          )}

          {isConnected && address ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-sm hover:bg-white/10"
                  data-testid="button-wallet-dropdown"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage
                      src={profile?.avatarUrl || profile?.displayAvatar}
                      alt={profile?.displayName}
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-green-500/20 text-green-500 text-[10px]">
                      {address.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start">
                    <span className="text-[10px] text-muted-foreground font-mono uppercase">
                      {solBalance !== null ? `${solBalance.toFixed(4)} SOL` : "..."}
                    </span>
                    <span className="text-xs font-mono text-primary font-bold">
                      {profile?.displayName || `${address.slice(0, 4)}...${address.slice(-4)}`}
                    </span>
                  </div>
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-80 bg-black/95 border-white/10 p-0 overflow-hidden"
                data-testid="dropdown-wallet-content"
              >
                <Tabs defaultValue="wallet" className="w-full">
                  <div className="px-3 py-3 border-b border-white/5 bg-white/5">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border border-primary/20">
                        <AvatarImage src={profile?.avatarUrl || profile?.displayAvatar} className="object-cover" />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {address.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate text-white">
                            {profile?.displayName || "Anonymous User"}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground hover:text-primary shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyAddress();
                            }}
                          >
                            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                          </Button>
                        </div>
                        <span className="text-[10px] text-muted-foreground truncate font-mono">{address}</span>
                      </div>
                    </div>
                  </div>

                  <TabsList className="grid w-full grid-cols-2 bg-black/50 rounded-none h-10 border-b border-white/10 p-0">
                    <TabsTrigger
                      value="wallet"
                      className="rounded-none data-[state=active]:bg-white/5 data-[state=active]:text-primary text-[10px] font-tech uppercase tracking-wider"
                    >
                      <Wallet className="w-3 h-3 mr-2" /> Wallet
                    </TabsTrigger>
                    <TabsTrigger
                      value="history"
                      className="rounded-none data-[state=active]:bg-white/5 data-[state=active]:text-primary text-[10px] font-tech uppercase tracking-wider"
                    >
                      <History className="w-3 h-3 mr-2" /> Void History
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="wallet" className="mt-0 outline-none">
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-tech text-muted-foreground uppercase tracking-widest">
                          SOL Balance
                        </span>
                        <span className="text-lg font-mono font-bold text-white" data-testid="text-sol-balance">
                          {solBalance !== null ? `${solBalance.toFixed(4)} SOL` : "—"}
                        </span>
                      </div>
                    </div>

                    <DropdownMenuSeparator className="bg-white/10 m-0" />

                    <DropdownMenuLabel className="text-[10px] font-tech text-muted-foreground uppercase tracking-widest px-3 py-2 flex items-center justify-between">
                      <span>SPL Tokens ({tokens.length})</span>
                      {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                    </DropdownMenuLabel>

                    <ScrollArea className="h-48 border-t border-white/5">
                      {tokens.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground text-xs font-tech uppercase opacity-50">
                          {isLoading ? "Scanning Void..." : "No tokens detected"}
                        </div>
                      ) : (
                        <div className="p-2 space-y-1">
                          {tokens.map((token) => (
                            <div
                              key={token.mint}
                              className="flex items-center gap-3 p-2 rounded-md hover:bg-white/5 transition-colors group"
                              data-testid={`token-item-${token.mint}`}
                            >
                              {token.logoUrl ? (
                                <img
                                  src={token.logoUrl}
                                  alt={token.symbol}
                                  className="w-6 h-6 rounded-full border border-white/10"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                                  <span className="text-[10px] font-bold text-primary uppercase">{token.symbol.slice(0, 2)}</span>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-mono font-bold text-white truncate group-hover:text-primary transition-colors">
                                  {token.symbol}
                                </div>
                                <div className="text-[10px] font-mono text-muted-foreground truncate">
                                  {token.mint.slice(0, 4)}...{token.mint.slice(-4)}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-mono text-white">{formatBalance(token.balance)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="history" className="mt-0 outline-none">
                    <div className="p-2">
                      <TransactionHistory walletAddress={address} />
                    </div>
                  </TabsContent>
                </Tabs>

                <DropdownMenuSeparator className="bg-white/10 m-0" />

                <div className="p-1">
                  <DropdownMenuItem
                    onClick={() => setProfileModalOpen(true)}
                    className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10 focus:text-primary transition-colors py-2"
                    data-testid="button-edit-profile"
                  >
                    <UserCircle className="w-4 h-4 mr-2" />
                    <span className="font-tech uppercase text-[10px] tracking-widest">Edit Profile</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={disconnect}
                    className="text-red-400 focus:text-red-400 focus:bg-red-400/10 cursor-pointer py-2"
                    data-testid="button-disconnect"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    <span className="font-tech uppercase text-[10px] tracking-widest">Disconnect Wallet</span>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              onClick={connect}
              disabled={isConnecting}
              className="bg-primary/10 text-primary border border-primary/50 hover:bg-primary hover:text-black hover:shadow-[0_0_20px_rgba(0,240,255,0.4)] transition-all font-tech font-bold uppercase tracking-wider"
              data-testid="button-connect-wallet"
            >
              {isConnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wallet className="w-4 h-4 mr-2" />}
              Connect Wallet
            </Button>
          )}
        </div>
      </div>

      <ProfileEditModal open={profileModalOpen} onOpenChange={setProfileModalOpen} />
    </header>
  );
}
