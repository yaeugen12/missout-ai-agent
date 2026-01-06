import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { ExternalLink, History, ArrowUpRight, ArrowDownLeft, PlusCircle, Trophy } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { getSolscanTxUrl } from "@/hooks/use-sdk-transaction";

interface TransactionHistoryProps {
  walletAddress: string;
}

export function TransactionHistory({ walletAddress }: TransactionHistoryProps) {
  const { data: transactions, isLoading } = useQuery({
    queryKey: [api.profiles.transactions.path.replace(":wallet", walletAddress)],
    queryFn: async () => {
      const res = await fetch(api.profiles.transactions.path.replace(":wallet", walletAddress));
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    enabled: !!walletAddress,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full bg-white/5 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div className="text-center py-12 bg-white/5 border border-dashed border-white/10 rounded-xl">
        <History className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
        <p className="text-muted-foreground font-tech uppercase tracking-widest text-sm">
          No transactions detected in the void
        </p>
      </div>
    );
  }

  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'CREATE':
        return { icon: <PlusCircle className="w-5 h-5" />, label: 'Opened Void', color: 'bg-green-500/10 text-green-400' };
      case 'PAYOUT':
        return { icon: <Trophy className="w-5 h-5" />, label: 'Escaped with Loot', color: 'bg-yellow-500/10 text-yellow-400' };
      case 'JOIN':
        return { icon: <ArrowUpRight className="w-5 h-5" />, label: 'Get Pulled In', color: 'bg-primary/10 text-primary' };
      default:
        return { icon: <ArrowDownLeft className="w-5 h-5" />, label: 'Feed the Void', color: 'bg-purple-500/10 text-purple-400' };
    }
  };

  return (
    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
      {transactions.map((tx: any) => {
        const styles = getTypeStyles(tx.type);
        return (
          <div 
            key={tx.id} 
            className="flex items-center justify-between p-4 bg-white/5 border border-white/5 hover:border-primary/30 rounded-xl transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className={`p-2 rounded-lg ${styles.color}`}>
                {styles.icon}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm tracking-wider uppercase">
                    {styles.label}
                  </span>
                  <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                    {tx.pool?.tokenSymbol}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground font-tech uppercase">
                  {format(new Date(tx.timestamp), "MMM d, HH:mm")}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className={`font-mono font-bold mb-1 ${tx.type === 'PAYOUT' ? 'text-yellow-400' : 'text-white'}`}>
                {tx.type === 'PAYOUT' ? '+' : ''}{tx.amount.toFixed(2)}
              </div>
              {tx.txHash && (
                <a 
                  href={getSolscanTxUrl(tx.txHash)} 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-white transition-colors uppercase font-tech"
                >
                  Solscan <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
