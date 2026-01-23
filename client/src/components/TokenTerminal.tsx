import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { 
  Loader2, 
  RefreshCw, 
  Rocket, 
  Timer, 
  CheckCircle2, 
  Search,
  Zap,
  TrendingUp,
  ArrowRightLeft,
  Copy,
  ExternalLink
} from "lucide-react";
import { heliusTokenDiscovery, DiscoveredToken, TokenCategory } from "@/lib/heliusTokenDiscovery";
import { useToast } from "@/hooks/use-toast";

interface TokenTerminalProps {
  onCreateLottery: (mintAddress: string) => void;
}

export function TokenTerminal({ onCreateLottery }: TokenTerminalProps) {
  const [tokens, setTokens] = useState<DiscoveredToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TokenCategory>("new_pairs");
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const fetchTokens = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    
    try {
      const discovered = await heliusTokenDiscovery.discoverRecentTokens();
      setTokens(discovered);
    } catch (err) {
      console.error("Failed to fetch tokens:", err);
      toast({
        title: "Discovery Error",
        description: "Failed to fetch token data from Helius",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    setLoading(false);
    setRefreshing(false);
  }, []);

  const filteredTokens: DiscoveredToken[] = [];

  const handleCopyMint = (mint: string) => {
    navigator.clipboard.writeText(mint);
    toast({ title: "Copied", description: "Mint address copied to clipboard" });
  };

  const getCategoryIcon = (category: TokenCategory) => {
    switch (category) {
      case "new_pairs": return <Rocket className="w-3 h-3" />;
      case "final_stretch": return <Timer className="w-3 h-3" />;
      case "migrated": return <CheckCircle2 className="w-3 h-3" />;
    }
  };

  const getCategoryBadgeVariant = (category: TokenCategory) => {
    switch (category) {
      case "new_pairs": return "default";
      case "final_stretch": return "secondary";
      case "migrated": return "outline";
    }
  };

  const getCategoryLabel = (category: TokenCategory) => {
    switch (category) {
      case "new_pairs": return "NEW";
      case "final_stretch": return "FINAL";
      case "migrated": return "MIGRATED";
    }
  };

  const getTabCount = (category: TokenCategory) => {
    return tokens.filter(t => t.category === category).length;
  };

  return (
    <div className="flex flex-col h-full bg-black/40 border border-white/10 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-2 p-3 border-b border-white/10 bg-black/60">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="font-mono text-sm text-white font-bold">TOKEN DISCOVERY</span>
          <Badge variant="outline" className="text-xs font-mono">
            {tokens.length} tokens
          </Badge>
        </div>
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={() => fetchTokens(true)}
          disabled={refreshing}
          data-testid="button-refresh-tokens"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="p-3 border-b border-white/10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, symbol, or mint..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-black/40 border-white/10 font-mono text-sm"
            data-testid="input-token-search"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TokenCategory)} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b border-white/10 bg-transparent p-0 h-auto">
          <TabsTrigger 
            value="new_pairs" 
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 font-mono text-xs gap-1"
            data-testid="tab-new-pairs"
          >
            <Rocket className="w-3 h-3" />
            NEW PAIRS
            <Badge variant="secondary" className="ml-1 text-xs">{getTabCount("new_pairs")}</Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="final_stretch"
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-yellow-500 data-[state=active]:bg-transparent py-3 font-mono text-xs gap-1"
            data-testid="tab-final-stretch"
          >
            <Timer className="w-3 h-3" />
            FINAL STRETCH
            <Badge variant="secondary" className="ml-1 text-xs">{getTabCount("final_stretch")}</Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="migrated"
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-green-500 data-[state=active]:bg-transparent py-3 font-mono text-xs gap-1"
            data-testid="tab-migrated"
          >
            <CheckCircle2 className="w-3 h-3" />
            MIGRATED
            <Badge variant="secondary" className="ml-1 text-xs">{getTabCount("migrated")}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="flex-1 m-0 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <span className="font-mono text-sm text-muted-foreground">Scanning Helius...</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center p-6 bg-primary/5 border border-primary/20 rounded-xl backdrop-blur-sm max-w-sm mx-auto">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/30">
                  <Zap className="w-8 h-8 text-primary animate-pulse" />
                </div>
                <h3 className="text-xl font-display font-bold text-white mb-2 tracking-tight">TERMINAL V2</h3>
                <p className="font-mono text-sm text-primary/80 mb-4 uppercase tracking-widest">System Upgrade in Progress</p>
                <div className="space-y-2 text-xs font-mono text-muted-foreground text-left bg-black/40 p-3 rounded border border-white/5">
                  <div className="flex justify-between">
                    <span>> STATUS:</span>
                    <span className="text-yellow-500">DEVELOPMENT</span>
                  </div>
                  <div className="flex justify-between">
                    <span>> ENGINE:</span>
                    <span>HELIUS H-ON-DEMAND</span>
                  </div>
                  <div className="flex justify-between">
                    <span>> ETA:</span>
                    <span className="text-primary">COMING SOON</span>
                  </div>
                </div>
                <p className="mt-6 text-xs text-muted-foreground/60 italic font-mono">
                  Advanced token discovery and real-time analytics are being migrated to our new high-speed infrastructure.
                </p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface TokenRowProps {
  token: DiscoveredToken;
  onCopy: (mint: string) => void;
  onCreateLottery: (mint: string) => void;
  getCategoryIcon: (category: TokenCategory) => JSX.Element;
  getCategoryBadgeVariant: (category: TokenCategory) => "default" | "secondary" | "outline";
  getCategoryLabel: (category: TokenCategory) => string;
}

function TokenRow({ token, onCopy, onCreateLottery, getCategoryIcon, getCategoryBadgeVariant, getCategoryLabel }: TokenRowProps) {
  return (
    <div 
      className="flex items-center gap-3 p-3 hover-elevate transition-colors"
      data-testid={`token-row-${token.mint.slice(0, 8)}`}
    >
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
        {token.logoUrl ? (
          <img src={token.logoUrl} alt={token.symbol} className="w-6 h-6 rounded-full" />
        ) : (
          <span className="text-xs font-bold text-primary">{token.symbol.slice(0, 2)}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-white truncate">{token.name}</span>
          <Badge variant={getCategoryBadgeVariant(token.category)} className="text-xs font-mono gap-1">
            {getCategoryIcon(token.category)}
            {getCategoryLabel(token.category)}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-xs text-muted-foreground">{token.symbol}</span>
          <span className="text-muted-foreground/40">|</span>
          <button 
            onClick={() => onCopy(token.mint)}
            className="font-mono text-xs text-muted-foreground/60 hover:text-primary flex items-center gap-1 transition-colors"
            data-testid={`button-copy-${token.mint.slice(0, 8)}`}
          >
            {token.mint.slice(0, 6)}...{token.mint.slice(-4)}
            <Copy className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-muted-foreground">
            <Timer className="w-3 h-3 inline mr-1" />
            {heliusTokenDiscovery.formatAge(token.ageSeconds)}
          </span>
          {token.recentActivity && (
            <span className="text-muted-foreground">
              <TrendingUp className="w-3 h-3 inline mr-1" />
              {token.recentActivity} txs
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <Button size="sm" variant="ghost" className="h-7 px-2 font-mono text-xs" data-testid={`button-buy-${token.mint.slice(0, 8)}`}>
          BUY
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 font-mono text-xs" data-testid={`button-sell-${token.mint.slice(0, 8)}`}>
          SELL
        </Button>
        <Button 
          size="sm" 
          variant="default" 
          className="h-7 px-2 font-mono text-xs gap-1"
          onClick={() => onCreateLottery(token.mint)}
          data-testid={`button-create-lottery-${token.mint.slice(0, 8)}`}
        >
          <ArrowRightLeft className="w-3 h-3" />
          LOTTERY
        </Button>
      </div>
    </div>
  );
}
