import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";
import { Droplet, Loader2, ExternalLink } from "lucide-react";
import { apiFetch } from "@/lib/api";

export function FaucetButton() {
  const [isRequesting, setIsRequesting] = useState(false);
  const { toast } = useToast();
  const { address, isConnected, connect } = useWallet();

  const handleFaucetRequest = async () => {
    if (!isConnected || !address) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to request test tokens.",
        variant: "destructive",
      });
      await connect();
      return;
    }

    setIsRequesting(true);

    try {
      const response = await apiFetch("/api/faucet/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress: address,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to request tokens");
      }

      const data = await response.json();

      toast({
        title: "🎉 Tokens Sent!",
        description: (
          <div className="flex flex-col gap-2">
            <p>Successfully sent {data.amount?.toLocaleString()} HNCZ to your wallet!</p>
            {data.explorerUrl && (
              <a
                href={data.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline text-sm"
              >
                View on Explorer
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        ),
        duration: 8000,
      });
    } catch (error: any) {
      console.error("Faucet error:", error);

      toast({
        title: "Request Failed",
        description: error.message || "Could not request tokens. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <Button
      onClick={handleFaucetRequest}
      disabled={isRequesting}
      variant="outline"
      size="sm"
      className="gap-2 bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20 hover:text-cyan-300 transition-all"
    >
      {isRequesting ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Requesting...
        </>
      ) : (
        <>
          <Droplet className="w-4 h-4" />
          Get Test HNCZ
        </>
      )}
    </Button>
  );
}
