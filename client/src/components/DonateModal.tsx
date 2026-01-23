import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type Pool } from "@/types/shared";
import { api } from "@/types/shared";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWallet } from "@/hooks/use-wallet";
import { useWalletBalances } from "@/hooks/use-wallet-balances";
import { useToast } from "@/hooks/use-toast";
import { useMissoutSDK } from "@/hooks/useMissoutSDK";
import { getSolscanTxUrl } from "@/hooks/use-sdk-transaction";
import { showTransactionToast } from "@/lib/transaction-toast";
import { shortenAddress } from "@/lib/colorUtils";
import { ExternalLink, Heart, Wallet, Loader2, Copy, Check, AlertCircle } from "lucide-react";

interface DonateModalProps {
  pool: Pool;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DonateModal({ pool, open, onOpenChange }: DonateModalProps) {
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { address, isConnected, connect } = useWallet();
  const { solBalance, tokens, isLoading: balancesLoading } = useWalletBalances();
  const { toast } = useToast();
  const { donateToPool, connected: sdkConnected } = useMissoutSDK();
  const queryClient = useQueryClient();

  const tokenBalance = pool.tokenSymbol === "SOL" 
    ? solBalance 
    : tokens.find(t => 
        t.symbol.toUpperCase() === pool.tokenSymbol.toUpperCase() || 
        t.mint.toLowerCase() === pool.tokenMint?.toLowerCase()
      )?.balance ?? 0;

  const poolAddress = pool.poolAddress;

  const handleSubmit = useCallback(async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount greater than 0",
        variant: "destructive",
      });
      return;
    }

    if (tokenBalance !== null && numAmount > tokenBalance) {
      toast({
        title: "Insufficient Balance",
        description: `You don't have enough ${pool.tokenSymbol}`,
        variant: "destructive",
      });
      return;
    }

    if (!poolAddress) {
      toast({
        title: "Pool Not Ready",
        description: "Pool address not available yet",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await donateToPool({
        poolId: poolAddress,
        amount: amount,
      });

      showTransactionToast({
        type: "success",
        title: "Donation Successful",
        description: `You fed ${amount} ${pool.tokenSymbol} to the void!`,
        txHash: result.tx
      });

      queryClient.invalidateQueries({ queryKey: [api.pools.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.pools.get.path, pool.id] });

      setAmount("");
      onOpenChange(false);
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Transaction failed");
      showTransactionToast({
        type: "error",
        title: "Donation Failed",
        description: err.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [amount, tokenBalance, pool.tokenSymbol, pool.id, poolAddress, donateToPool, toast, queryClient, onOpenChange]);

  const handleCopyPoolId = useCallback(() => {
    const poolId = pool.poolAddress || `pool-${pool.id}`;
    navigator.clipboard.writeText(poolId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [pool.poolAddress, pool.id]);

  const handleMaxClick = useCallback(() => {
    if (tokenBalance !== null) {
      setAmount(tokenBalance.toString());
    }
  }, [tokenBalance]);

  const solscanUrl = pool.poolAddress 
    ? `https://solscan.io/account/${pool.poolAddress}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-black/95 border-white/10 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Heart className="w-5 h-5 text-primary" />
            Feed the Void
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Donate {pool.tokenSymbol} to increase the prize pool. Donations are non-participatory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-white/5 rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Pool ID</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-white">
                  {pool.poolAddress ? shortenAddress(pool.poolAddress) : `#${pool.id}`}
                </span>
                <button
                  onClick={handleCopyPoolId}
                  className="hover:text-white transition-colors"
                  data-testid="button-copy-pool-id-modal"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                {solscanUrl && (
                  <a
                    href={solscanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white transition-colors"
                    data-testid="link-solscan-modal"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Token</span>
              <span className="text-white font-medium">{pool.tokenSymbol}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Current Pool</span>
              <span className="text-primary font-mono font-bold">
                {(pool.totalPot ?? 0).toLocaleString()} {pool.tokenSymbol}
              </span>
            </div>
          </div>

          {!isConnected ? (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-yellow-200 mb-2">
                  Connect your wallet to donate
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={connect}
                  className="gap-2"
                  data-testid="button-connect-donate-modal"
                >
                  <Wallet className="w-4 h-4" />
                  Connect Wallet
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="donation-amount" className="text-sm text-muted-foreground">
                    Amount
                  </Label>
                  <div className="flex items-center gap-2 text-xs">
                    <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Balance:</span>
                    {balancesLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                    ) : (
                      <span className="font-mono text-white">
                        {tokenBalance?.toLocaleString() ?? "0"} {pool.tokenSymbol}
                      </span>
                    )}
                  </div>
                </div>
                <div className="relative">
                  <Input
                    id="donation-amount"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-white/5 border-white/10 text-white font-mono pr-16"
                    data-testid="input-donation-amount"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleMaxClick}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-xs text-primary hover:text-primary/80"
                    data-testid="button-max-amount"
                  >
                    MAX
                  </Button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground bg-white/5 rounded-md p-3">
                <p className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Donations add to the prize pool but do not count as an entry
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
            data-testid="button-cancel-donate"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isConnected || !sdkConnected || isSubmitting || !amount || !poolAddress}
            className="flex-1 gap-2"
            data-testid="button-confirm-donate"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Heart className="w-4 h-4" />
            )}
            {isSubmitting ? "Signing..." : "Confirm Donation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
