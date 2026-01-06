import BN from "bn.js";
import { PublicKey, Connection } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";

const U64_MAX = 18_446_744_073_709_551_615n;

export async function getTokenDecimals(
  mint: PublicKey,
  connection: Connection
): Promise<number> {
  try {
    const mintInfo = await getMint(connection, mint);
    return mintInfo.decimals;
  } catch (err) {
    console.warn(`[getTokenDecimals] Failed to fetch mint ${mint.toBase58()}, defaulting to 9 decimals:`, err);
    return 9; // Default to 9 decimals (standard for most SPL tokens)
  }
}

export class TokenAmount {
  lamports: bigint;
  decimals: number;

  constructor(lamports: bigint, decimals: number) {
    if (lamports < 0n) {
      throw new Error("TokenAmount: amount cannot be negative");
    }
    if (lamports > U64_MAX) {
      throw new Error("TokenAmount exceeds u64::MAX");
    }
    this.lamports = lamports;
    this.decimals = decimals;
  }

  toBN(): BN {
    return new BN(this.lamports.toString());
  }

  toNumber(): number {
    const divisor = Number(10n ** BigInt(this.decimals));
    return Number(this.lamports) / divisor;
  }

  toTokens(): string {
    const d = BigInt(this.decimals);
    const divisor = 10n ** d;
    const whole = this.lamports / divisor;
    const frac = this.lamports % divisor;

    if (frac === 0n) return whole.toString();

    const paddedFrac = frac.toString().padStart(this.decimals, "0");
    return `${whole}.${paddedFrac}`.replace(/\.?0+$/, "");
  }

  static async fromTokens(
    tokens: string | number | bigint,
    mint: PublicKey,
    connection: Connection
  ): Promise<TokenAmount> {
    let decimals: number;
    try {
      const mintInfo = await getMint(connection, mint);
      decimals = mintInfo.decimals;
    } catch (err) {
      console.warn(`[TokenAmount.fromTokens] Failed to fetch mint ${mint.toBase58()}, defaulting to 9 decimals:`, err);
      decimals = 9; // Default to 9 decimals (standard for most SPL tokens)
    }
    const multiplier = 10n ** BigInt(decimals);

    let lamports: bigint;

    if (typeof tokens === "bigint") {
      lamports = tokens * multiplier;
    } else if (typeof tokens === "number") {
      if (!Number.isFinite(tokens) || tokens < 0) {
        throw new Error("Invalid number input");
      }
      lamports = BigInt(Math.round(tokens * Number(multiplier)));
    } else {
      const str = tokens.trim();
      if (!/^\d+(\.\d+)?$/.test(str)) {
        throw new Error("Invalid token string");
      }
      const [whole, fracRaw] = str.split(".");
      const frac = fracRaw ? fracRaw.padEnd(decimals, "0").slice(0, decimals) : "0";
      lamports = BigInt(whole) * multiplier + BigInt(frac);
    }

    return new TokenAmount(lamports, decimals);
  }

  static fromLamports(
    lamports: bigint | number | string | BN,
    decimals: number
  ): TokenAmount {
    let lam: bigint;

    if (lamports instanceof BN) {
      lam = BigInt(lamports.toString());
    } else if (typeof lamports === "bigint") {
      lam = lamports;
    } else if (typeof lamports === "number") {
      lam = BigInt(lamports);
    } else {
      lam = BigInt(lamports);
    }

    return new TokenAmount(lam, decimals);
  }
}
