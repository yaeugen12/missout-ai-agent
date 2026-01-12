/**
 * Token Program Utilities for Backend
 *
 * Shared utilities for resolving token programs (SPL Token vs Token-2022)
 * for both client and server code.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

/**
 * Resolves which token program (SPL Token or Token-2022) owns a given mint.
 *
 * This is the SINGLE SOURCE OF TRUTH for determining token program.
 * Call this before building any transaction that involves token operations.
 *
 * @param connection - Solana connection
 * @param mint - The mint public key
 * @returns The token program ID (either TOKEN_PROGRAM_ID or TOKEN_2022_PROGRAM_ID)
 * @throws Error if mint account doesn't exist or owner is neither token program
 */
export async function resolveTokenProgramForMint(
  connection: Connection,
  mint: PublicKey
): Promise<PublicKey> {
  const mintInfo = await connection.getAccountInfo(mint, "confirmed");

  if (!mintInfo) {
    throw new Error(`Mint account not found: ${mint.toBase58()}`);
  }

  const owner = mintInfo.owner;

  // Validate it's a recognized token program
  if (!owner.equals(TOKEN_PROGRAM_ID) && !owner.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error(
      `Invalid mint owner: ${owner.toBase58()}. Expected TOKEN_PROGRAM_ID or TOKEN_2022_PROGRAM_ID.`
    );
  }

  return owner;
}

/**
 * Check if a mint is Token-2022
 */
export async function isToken2022Mint(connection: Connection, mint: PublicKey): Promise<boolean> {
  try {
    const tokenProgramId = await resolveTokenProgramForMint(connection, mint);
    return tokenProgramId.equals(TOKEN_2022_PROGRAM_ID);
  } catch {
    return false;
  }
}

/**
 * Check if a mint is classic SPL Token
 */
export async function isClassicSPLToken(connection: Connection, mint: PublicKey): Promise<boolean> {
  try {
    const tokenProgramId = await resolveTokenProgramForMint(connection, mint);
    return tokenProgramId.equals(TOKEN_PROGRAM_ID);
  } catch {
    return false;
  }
}
