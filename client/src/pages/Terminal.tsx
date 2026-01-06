import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { TokenTerminal } from "@/components/TokenTerminal";
import { CreatePoolWizard } from "@/components/CreatePoolWizard";
import { Zap } from "lucide-react";

export default function Terminal() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [prefillMint, setPrefillMint] = useState<string | undefined>();

  const handleCreateLottery = (mintAddress: string) => {
    setPrefillMint(mintAddress);
    setWizardOpen(true);
  };

  const handleWizardClose = (open: boolean) => {
    setWizardOpen(open);
    if (!open) {
      setPrefillMint(undefined);
    }
  };

  return (
    <div className="min-h-screen bg-grid-pattern flex flex-col">
      <main className="flex-1 container mx-auto px-4 py-6 flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-black text-white tracking-tight">
              TOKEN <span className="text-primary text-neon-cyan">TERMINAL</span>
            </h1>
            <p className="text-muted-foreground font-tech text-sm">
              Real-time token discovery powered by Helius RPC
            </p>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <TokenTerminal onCreateLottery={handleCreateLottery} />
        </div>
      </main>

      <CreatePoolWizard 
        open={wizardOpen} 
        onOpenChange={handleWizardClose}
        prefillMintAddress={prefillMint}
      />
    </div>
  );
}
