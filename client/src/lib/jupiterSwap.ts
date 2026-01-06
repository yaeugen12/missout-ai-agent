import { Connection, VersionedTransaction, PublicKey } from "@solana/web3.js";

const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const PLATFORM_FEE_BPS = 50; // 0.5% fee

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
  slippageBps: number = 50
): Promise<JupiterQuote | null> {
  try {
    const amountInLamports = Math.floor(solAmount * 1_000_000_000);
    
    const params = new URLSearchParams({
      inputMint: SOL_MINT,
      outputMint,
      amount: amountInLamports.toString(),
      slippageBps: slippageBps.toString(),
      swapMode: "ExactIn",
      platformFeeBps: PLATFORM_FEE_BPS.toString(),
    });

    const response = await fetch(`${JUPITER_QUOTE_API}/quote?${params}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Jupiter] Quote error:", errorText);
      return null;
    }

    const quote = await response.json();
    return quote;
  } catch (error) {
    console.error("[Jupiter] Failed to get quote:", error);
    return null;
  }
}

export async function executeJupiterSwap(
  quote: JupiterQuote,
  userPublicKey: string,
  feeAccount: string,
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
  connection: Connection
): Promise<SwapResult> {
  const swapResponse = await fetch(`${JUPITER_QUOTE_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      feeAccount,
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
