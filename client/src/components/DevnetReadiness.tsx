import { useState, useEffect, useCallback, useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, AlertCircle, Loader2, ArrowRight, Bug } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PROGRAM_ID, DEVNET_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@/lib/solana-sdk/programs/program-id";
import { getConnectionInfo, initConnection, getSolBalance } from "@/lib/solana-sdk/connection";
import clsx from "clsx";

interface ReadinessItem {
  id: string;
  label: string;
  status: 'pending' | 'success' | 'error' | 'loading';
  fixAction?: () => Promise<void>;
  fixLabel?: string;
  error?: string;
}

export function DevnetReadiness() {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { toast } = useToast();
  
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [cluster, setCluster] = useState<string | null>(null);
  const [isAirdropping, setIsAirdropping] = useState(false);
  const [isCreatingAta, setIsCreatingAta] = useState(false);
  const [ataExists, setAtaExists] = useState<boolean | null>(null);
  const [ataBalance, setAtaBalance] = useState<string | null>(null);
  const [connInfo, setConnInfo] = useState(getConnectionInfo());
  const [mintProgramId, setMintProgramId] = useState<PublicKey | null>(null);
  const [derivedAta, setDerivedAta] = useState<PublicKey | null>(null);

  const rpcEndpoint = useMemo(() => connInfo?.endpoint || connection?.rpcEndpoint, [connInfo, connection]);
  const detectedCluster = useMemo(() => connInfo?.cluster || "unknown", [connInfo]);
  const usingFallback = useMemo(() => connInfo?.usingFallback ?? false, [connInfo]);

  useEffect(() => {
    // Initial fetch if not ready
    if (!connInfo) {
      initConnection().then(() => setConnInfo(getConnectionInfo()));
    }
  }, [connInfo]);

  useEffect(() => {
    const fetchMintInfo = async () => {
      if (!connection || !DEVNET_MINT) return;
      try {
        console.log("[Solana Debug] Fetching account info for mint:", DEVNET_MINT.toBase58());
        const info = await connection.getAccountInfo(DEVNET_MINT, 'confirmed');
        if (info) {
          console.log("[Solana Debug] Mint info found, owner:", info.owner.toBase58());
          setMintProgramId(info.owner);
        } else {
          console.warn("[Solana Debug] Mint account info not found! Defaulting to Tokenkeg");
          setMintProgramId(TOKEN_PROGRAM_ID);
        }
      } catch (e) {
        console.error("Error fetching mint info:", e);
        setMintProgramId(TOKEN_PROGRAM_ID);
      }
    };
    fetchMintInfo();
  }, [connection]);

  useEffect(() => {
    const deriveAta = async () => {
      if (publicKey && mintProgramId) {
        try {
          const ata = await getAssociatedTokenAddress(
            DEVNET_MINT, 
            publicKey, 
            false, 
            mintProgramId,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );
          console.log("[Solana Debug] Derived ATA:", ata.toBase58(), "Program:", mintProgramId.toBase58());
          setDerivedAta(ata);
        } catch (e) {
          console.error("Error deriving ATA:", e);
        }
      }
    };
    deriveAta();
  }, [publicKey, mintProgramId]);

  useEffect(() => {
    if (connInfo) {
      console.log("[Solana Debug] Full State", {
        wallet: publicKey?.toBase58() || "not connected",
        endpoint: connInfo.endpoint,
        cluster: connInfo.cluster,
        usingFallback: connInfo.usingFallback,
        programId: PROGRAM_ID.toBase58(),
        mint: DEVNET_MINT.toBase58(),
        mintOwner: mintProgramId?.toBase58(),
        ata: derivedAta?.toBase58()
      });
    }
  }, [publicKey, connInfo, mintProgramId, derivedAta]);

  const refreshStatus = useCallback(async () => {
    if (!connection) return;

    try {
      // 1. Cluster check - Robust Devnet verification
      let isDevnet = false;
      try {
        const genesis = await connection.getGenesisHash();
        isDevnet = genesis.startsWith("EtW") || genesis.startsWith("4uh") || genesis.startsWith("5ey");
        setCluster(isDevnet ? "devnet" : "other");
      } catch (e) {
        // Fallback to endpoint check if genesis fails
        isDevnet = connection.rpcEndpoint.includes("devnet");
        setCluster(isDevnet ? "devnet" : "unknown");
      }

      if (publicKey) {
        // 2. Balance check - Single source of truth (finalized)
        try {
          setBalanceError(null);
          const lamports = await connection.getBalance(publicKey, "finalized");
          setBalance(lamports / LAMPORTS_PER_SOL);
        } catch (err: any) {
          setBalanceError(err.message || "Failed to fetch balance");
          setBalance(null);
        }

        // 3. ATA check - On-chain truth
        try {
          if (derivedAta) {
            console.log("[Solana Debug] Checking ATA on-chain:", derivedAta.toBase58());
            const info = await connection.getAccountInfo(derivedAta, 'finalized');
            setAtaExists(!!info);
            
            if (info) {
              try {
                // Fetch real balance, not optimistic
                const tokenBalance = await connection.getTokenAccountBalance(derivedAta, 'finalized');
                setAtaBalance(tokenBalance.value.uiAmountString || "0");
              } catch (e) {
                setAtaBalance("0");
              }
            } else {
              setAtaBalance(null);
            }
          }
        } catch (e) {
          setAtaExists(false);
          setAtaBalance(null);
        }
      }
    } catch (err: any) {
      console.error("Readiness check error:", err);
      if (connInfo) connInfo.lastError = err.message;
    }
  }, [connection, publicKey, derivedAta, connInfo]);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 10000);
    return () => clearInterval(interval);
  }, [refreshStatus, connected, rpcEndpoint]);

  const handleAirdrop = async () => {
    if (!publicKey || !connection) return;
    setIsAirdropping(true);
    try {
      const sig = await connection.requestAirdrop(publicKey, 1 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
      toast({ title: "Airdrop Success", description: "1 SOL received on devnet" });
      refreshStatus();
    } catch (err) {
      toast({ variant: "destructive", title: "Airdrop Failed", description: "Rate limited or devnet issue" });
    } finally {
      setIsAirdropping(false);
    }
  };

  const handleCreateAta = async () => {
    if (!publicKey || !connection || !derivedAta || !mintProgramId) return;
    
    // Check if exists first
    try {
      const info = await connection.getAccountInfo(derivedAta);
      if (info) {
        setAtaExists(true);
        toast({ title: "ATA already exists for this mint", description: "No action needed" });
        return;
      }
    } catch (e) {}

    setIsCreatingAta(true);
    try {
      const ix = createAssociatedTokenAccountInstruction(
        publicKey,
        derivedAta,
        publicKey,
        DEVNET_MINT,
        mintProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const tx = new Transaction().add(ix);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig);
      toast({ title: "ATA Created", description: "Token account initialized" });
      refreshStatus();
    } catch (err) {
      toast({ variant: "destructive", title: "ATA Failed", description: "Transaction failed" });
    } finally {
      setIsCreatingAta(false);
    }
  };

  const items: ReadinessItem[] = [
    {
      id: "wallet",
      label: "Wallet Connected",
      status: connected ? 'success' : 'error',
      fixLabel: "Connect",
      fixAction: async () => { /* Wallet button handles this */ }
    },
    {
      id: "cluster",
      label: "Devnet Cluster",
      status: detectedCluster === 'devnet' ? 'success' : 'error',
      fixLabel: "Switch to Devnet",
      fixAction: async () => { 
        await initConnection();
        setConnInfo(getConnectionInfo());
        toast({ title: "Re-initialized", description: "Connection rebuilt" });
      }
    },
    {
      id: "sol",
      label: "SOL Balance (>= 0.05)",
      status: balance !== null && balance >= 0.05 ? 'success' : (balance === null && !balanceError ? 'loading' : 'error'),
      fixLabel: "Airdrop 1 SOL",
      fixAction: handleAirdrop,
      error: balanceError || undefined
    },
    {
      id: "mint",
      label: "Mint Ready (Test Token)",
      status: 'success'
    },
    {
      id: "ata",
      label: "Token Account (ATA)",
      status: ataExists ? 'success' : (ataExists === null ? 'loading' : 'error'),
      fixLabel: "Initialize ATA",
      fixAction: handleCreateAta
    }
  ];

  return (
    <Card className="bg-black/40 border-primary/20 backdrop-blur-md mb-8">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-tech uppercase tracking-widest flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-primary" />
          Devnet Readiness Checklist
        </CardTitle>
        <Button 
          size="sm" 
          variant="ghost" 
          className="h-7 px-2 text-[10px] text-primary hover:bg-primary/10"
          onClick={() => refreshStatus()}
        >
          Refresh balance
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-4 p-2 rounded bg-white/5 border border-white/5">
              <div className="flex items-center gap-3">
                {item.status === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : item.status === 'loading' ? (
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground" />
                )}
                <span className={clsx(
                  "text-sm font-medium",
                  item.status === 'success' ? "text-white" : "text-muted-foreground"
                )}>
                  {item.label}
                  {item.id === 'sol' && balance !== null && ` (${balance.toFixed(4)} SOL)`}
                </span>
              </div>
              
              {item.status === 'error' && item.fixAction && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-7 px-3 text-[10px] uppercase font-bold border-primary/50 text-primary hover:bg-primary hover:text-black"
                  onClick={item.fixAction}
                  disabled={isAirdropping || isCreatingAta}
                >
                  {(isAirdropping && item.id === 'sol') || (isCreatingAta && item.id === 'ata') ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      {item.fixLabel}
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </>
                  )}
                </Button>
              )}
            </div>
            {item.error && (
              <span className="text-[10px] text-red-400 px-2 font-mono">
                Error: {item.error}
              </span>
            )}
          </div>
        ))}
      </CardContent>

      <div className="mx-6 mb-6 p-3 rounded-lg bg-zinc-950/50 border border-white/5 space-y-2">
        <div className="flex items-center gap-2 text-[10px] font-tech text-muted-foreground uppercase tracking-widest mb-1">
          <Bug className="w-3 h-3 text-primary" />
          Solana Debug Info
        </div>
        <div className="grid grid-cols-1 gap-1 text-[10px] font-mono">
          <div className="flex justify-between border-b border-white/5 pb-1">
            <span className="text-muted-foreground">Wallet:</span>
            <span className="text-white truncate max-w-[200px]">{publicKey?.toBase58() || "Disconnected"}</span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-1 pt-1">
            <span className="text-muted-foreground">RPC:</span>
            <span className="text-white truncate max-w-[200px]">{rpcEndpoint}</span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-1 pt-1">
            <span className="text-muted-foreground">Cluster:</span>
            <span className={clsx(detectedCluster === "devnet" ? "text-green-400" : "text-yellow-400")}>{detectedCluster}</span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-1 pt-1">
            <span className="text-muted-foreground">Fallback:</span>
            <span className={usingFallback ? "text-yellow-400" : "text-green-400"}>{usingFallback ? "ACTIVE" : "NONE"}</span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-1 pt-1">
            <span className="text-muted-foreground">Mint:</span>
            <span className="text-white truncate max-w-[200px]">{DEVNET_MINT.toBase58()}</span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-1 pt-1">
            <span className="text-muted-foreground">Mint Program:</span>
            <span className="text-white truncate max-w-[200px]">{mintProgramId?.toBase58() === TOKEN_2022_PROGRAM_ID.toBase58() ? "Token-2022" : (mintProgramId?.toBase58() === TOKEN_PROGRAM_ID.toBase58() ? "Tokenkeg" : "Checking...")}</span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-1 pt-1">
            <span className="text-muted-foreground">Derived ATA:</span>
            <span className="text-white truncate max-w-[200px]">{derivedAta?.toBase58() || "Deriving..."}</span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-1 pt-1">
            <span className="text-muted-foreground">ATA Exists:</span>
            <span className={ataExists ? "text-green-400" : "text-red-400"}>{ataExists ? "YES" : "NO"}</span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-1 pt-1">
            <span className="text-muted-foreground">ATA Balance:</span>
            <span className="text-white">{ataBalance !== null ? `${ataBalance}` : "N/A"}</span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-1 pt-1">
            <span className="text-muted-foreground">Last RPC Error:</span>
            <span className="text-red-400 truncate max-w-[200px]">{connInfo?.lastError || "None"}</span>
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-muted-foreground">Program:</span>
            <span className="text-primary truncate max-w-[200px]">{PROGRAM_ID.toBase58()}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
