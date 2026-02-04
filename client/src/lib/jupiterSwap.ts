import { Connection, VersionedTransaction, PublicKey } from "@solana/web3.js";

// Direct Jupiter API with client-side API key
const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6";
const JUPITER_API_KEY = import.meta.env.VITE_JUPITER_API_KEY || "a0606ac5-20d2-4cf3-bf18-bdeb2d26e118";
const SOL_MINT = "So11111111111111111111111111111111111111112";

export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: any[];
  contextSlot: number;
  timeTaken: number;
}

export interface SwapResult {
  signature: string;
  inputAmount: string;
  outputAmount: string;
}

export async function getJupiterQuote(
  outputMint: string,
  solAmount: number,
  slippageBps: number = 100
): Promise<JupiterQuote | null> {
  try {
    const amountInLamports = Math.floor(solAmount * 1_000_000_000);
    
    const url = `${JUPITER_QUOTE_API}/quote?inputMint=${SOL_MINT}&outputMint=${outputMint}&amount=${amountInLamports}&slippageBps=${slippageBps}`;
    
    console.log("[Jupiter] Fetching quote from:", url);
    
    const response = await fetch(url, {
      headers: {
        'x-api-key': JUPITER_API_KEY,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Jupiter] Quote API error:", response.status, errorText);
      return null;
    }

    const quote = await response.json();
    
    if (quote.error) {
      console.error("[Jupiter] Quote returned error:", quote.error);
      return null;
    }
    
    console.log("[Jupiter] Quote received:", quote.outAmount, "tokens");
    return quote;
  } catch (error: any) {
    console.error("[Jupiter] Failed to get quote:", error?.message || error);
    return null;
  }
}

export async function executeJupiterSwap(
  quote: JupiterQuote,
  userPublicKey: string,
  _feeAccount: string,
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
  connection: Connection
): Promise<SwapResult> {
  const swapResponse = await fetch(`${JUPITER_QUOTE_API}/swap`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-api-key": JUPITER_API_KEY,
      "Accept": "application/json",
    },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: "auto",
      dynamicComputeUnitLimit: true,
    }),
  });

  if (!swapResponse.ok) {
    const errorText = await swapResponse.text();
    throw new Error(`Swap request failed: ${errorText}`);
  }

  const { swapTransaction } = await swapResponse.json();
  
  const swapTransactionBuf = Buffer.from(swapTransaction, "base64");
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
  
  const signedTransaction = await signTransaction(transaction);
  
  const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
    skipPreflight: true,
    maxRetries: 3,
  });

  await connection.confirmTransaction(signature, "confirmed");

  return {
    signature,
    inputAmount: quote.inAmount,
    outputAmount: quote.outAmount,
  };
}

export function formatTokenAmount(amount: string, decimals: number): string {
  const value = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const intPart = value / divisor;
  const fracPart = value % divisor;
  
  const fracStr = fracPart.toString().padStart(decimals, "0").slice(0, 4);
  return `${intPart}.${fracStr}`;
}

export function lamportsToSol(lamports: string | number): number {
  return Number(lamports) / 1_000_000_000;
}
