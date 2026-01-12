import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Loader2, Droplets, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useWallet } from "../hooks/use-wallet";
import { toast } from "sonner";

interface FaucetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TokenType = "classic" | "token2022";

const CLASSIC_MINT = "HNcz9fndVXBogLjU55uyvbz79P5qWxaBZVKk7iRSy7jV";
const TOKEN2022_MINT = "BhzvZjrFpMtmCamkuPvc1tfrdQHaVovRzvFhqgVj2yRH";

export default function FaucetModal({ open, onOpenChange }: FaucetModalProps) {
  const { address } = useWallet();
  const [loading, setLoading] = useState<TokenType | null>(null);
  const [successToken, setSuccessToken] = useState<TokenType | null>(null);

  const handleClaim = async (tokenType: TokenType) => {
    if (!address) {
      toast.error("Please connect your wallet first");
      return;
    }

    setLoading(tokenType);
    setSuccessToken(null);

    try {
      console.log(`[Faucet] Claiming ${tokenType} tokens for ${address}`);

      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/faucet/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          tokenType,
        }),
        credentials: "include",
      });

      const data = await response.json();
      console.log(`[Faucet] Response:`, data);

      if (data.success) {
        setSuccessToken(tokenType);
        toast.success("Tokens received!", {
          description: `Welcome to MissOut — you are ready to play`,
        });
        console.log(`[Faucet] Success! Signature: ${data.signature}`);
      } else {
        toast.error("Failed to claim tokens", {
          description: data.error || "Please try again",
        });
        console.error(`[Faucet] Error:`, data.error);
      }
    } catch (error) {
      console.error("[Faucet] Network error:", error);
      toast.error("Network error", {
        description: "Please check your connection and try again",
      });
    } finally {
      setLoading(null);
    }
  };

  const getLastFourChars = (address: string) => address.slice(-4);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-black/95 border border-primary/30">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-primary flex items-center gap-2">
            <Droplets className="w-6 h-6" />
            TOKEN FAUCET
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6 mt-4">
          {/* Classic SPL Token */}
          <div className="border border-primary/30 rounded-lg p-6 bg-gradient-to-br from-primary/5 to-transparent flex flex-col">
            <h3 className="text-lg font-bold text-primary mb-3">Classic SPL Token</h3>

            <div className="space-y-2 mb-4 text-sm text-gray-300 flex-grow">
              <p>Standard SPL token</p>
              <p>Fully permitted for MissOut Lottery</p>
              <p>No restricted extensions</p>
            </div>

            {successToken === "classic" ? (
              <div className="flex items-center gap-2 text-green-400 mb-4">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-semibold text-sm">Success! Tokens received</span>
              </div>
            ) : null}

            <Button
              onClick={() => handleClaim("classic")}
              disabled={loading !== null}
              className="w-full bg-primary hover:bg-primary/80 text-black font-bold mt-auto"
            >
              {loading === "classic" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Claiming...
                </>
              ) : (
                <>
                  CLAIM {getLastFourChars(CLASSIC_MINT)}
                </>
              )}
            </Button>
          </div>

          {/* Token-2022 */}
          <div className="border border-yellow-500/30 rounded-lg p-6 bg-gradient-to-br from-yellow-500/5 to-transparent flex flex-col">
            <h3 className="text-lg font-bold text-yellow-400 mb-3">Token-2022</h3>

            <div className="space-y-2 mb-4 text-sm text-gray-300 flex-grow">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-yellow-400">Not permitted for MissOut Lottery</p>
                  <p className="text-xs mt-1">Uses Token-2022 extensions:</p>
                  <ul className="text-xs mt-1 space-y-0.5 ml-2">
                    <li>• Non-transferable</li>
                    <li>• Transfer hooks</li>
                    <li>• Restricted extensions</li>
                  </ul>
                </div>
              </div>
            </div>

            {successToken === "token2022" ? (
              <div className="flex items-center gap-2 text-green-400 mb-4">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-semibold text-sm">Success! Tokens received</span>
              </div>
            ) : null}

            <Button
              onClick={() => handleClaim("token2022")}
              disabled={loading !== null}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold mt-auto"
            >
              {loading === "token2022" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Claiming...
                </>
              ) : (
                <>
                  CLAIM {getLastFourChars(TOKEN2022_MINT)}
                </>
              )}
            </Button>
          </div>
        </div>

        {successToken && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle2 className="w-5 h-5" />
              <div>
                <p className="font-semibold">Success</p>
                <p className="text-sm">Tokens received — Welcome to MissOut, you are ready to play</p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
