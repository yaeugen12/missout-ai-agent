/**
 * Token Program Helpers for Dual SPL Token + Token-2022 Support
 *
 * This module provides helpers to automatically detect and handle both
 * SPL Token (classic) and Token-2022 (TokenzQd...) token programs.
 *
 * Key Principle: Never hardcode TOKEN_PROGRAM_ID. Always resolve dynamically
 * by fetching the mint account and reading its owner.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import { PROGRAM_ID } from "../programs/program-id";

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
 * Derives the pool PDA.
 * Seeds: ["pool", mint, salt]
 *
 * @param mint - The mint public key
 * @param salt - 32-byte salt (unique pool identifier)
 * @returns [poolPda, bump]
 */
export function derivePoolPda(mint: PublicKey, salt: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), mint.toBuffer(), Buffer.from(salt)],
    PROGRAM_ID
  );
}

/**
 * Derives the participants PDA.
 * Seeds: ["participants", pool]
 *
 * @param pool - The pool public key
 * @returns [participantsPda, bump]
 */
export function deriveParticipantsPda(pool: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("participants"), pool.toBuffer()], PROGRAM_ID);
}

/**
 * Derives an Associated Token Address (ATA) with explicit token program.
 *
 * CRITICAL: Always pass the correct tokenProgramId (from resolveTokenProgramForMint).
 * This ensures ATAs work for both SPL Token and Token-2022 mints.
 *
 * @param mint - The mint public key
 * @param owner - The owner public key (user wallet or PDA)
 * @param tokenProgramId - The token program ID (TOKEN_PROGRAM_ID or TOKEN_2022_PROGRAM_ID)
 * @returns The ATA public key
 */
export function deriveAta(mint: PublicKey, owner: PublicKey, tokenProgramId: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(
    mint,
    owner,
    true, // allowOwnerOffCurve (required for PDAs as owners)
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

/**
 * Derives the pool's token vault ATA.
 * This is a convenience wrapper around deriveAta for pool-owned ATAs.
 *
 * @param mint - The mint public key
 * @param pool - The pool PDA public key
 * @param tokenProgramId - The token program ID
 * @returns The pool token vault ATA public key
 */
export function derivePoolTokenAddress(
  mint: PublicKey,
  pool: PublicKey,
  tokenProgramId: PublicKey
): PublicKey {
  return deriveAta(mint, pool, tokenProgramId);
}
