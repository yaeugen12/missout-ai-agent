import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { api } from "@shared/routes";

const SOLSCAN_BASE_URL = "https://solscan.io/tx";

export interface TransactionResult {
  tx: string;
  poolId?: string;
}

export interface UseSDKTransactionOptions {
  onSuccess?: (result: TransactionResult) => void;
  onError?: (error: Error) => void;
  successTitle?: string;
  successDescription?: string;
  errorTitle?: string;
  invalidatePoolId?: number;
}

export function useSDKTransaction<T extends (...args: any[]) => Promise<TransactionResult>>(
  transactionFn: T,
  options: UseSDKTransactionOptions = {}
) {
  const [isPending, setIsPending] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const execute = useCallback(
    async (...args: Parameters<T>): Promise<TransactionResult | null> => {
      setIsPending(true);
      try {
        const result = await transactionFn(...args);
        
        const solscanUrl = `${SOLSCAN_BASE_URL}/${result.tx}`;
        const shortSig = result.tx.slice(0, 8) + "..." + result.tx.slice(-8);
        
        toast({
          title: options.successTitle || "Transaction Confirmed",
          description: `${options.successDescription || "Transaction successful"} - Signature: ${shortSig}`,
          action: undefined,
        });

        console.log("Transaction confirmed:", solscanUrl);

        queryClient.invalidateQueries({ queryKey: [api.pools.list.path] });
        if (options.invalidatePoolId) {
          queryClient.invalidateQueries({ queryKey: [api.pools.get.path, options.invalidatePoolId] });
        }

        options.onSuccess?.(result);
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Transaction failed");
        
        toast({
          variant: "destructive",
          title: options.errorTitle || "Transaction Failed",
          description: err.message,
        });

        options.onError?.(err);
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [transactionFn, queryClient, toast, options]
  );

  return {
    execute,
    isPending,
  };
}

export function getSolscanTxUrl(signature: string): string {
  return `${SOLSCAN_BASE_URL}/${signature}`;
}

export function getSolscanAccountUrl(address: string): string {
  return `https://solscan.io/account/${address}`;
}
