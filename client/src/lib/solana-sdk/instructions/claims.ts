/**
 * Claim and Admin Closure Instructions
 *
 * Instructions for users to claim refunds/rent and admins to close pools.
 */

import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

import { PROGRAM_ID } from "../programs/program-id";
import { deriveParticipantsPda, derivePoolTokenAddress, deriveAta } from "../utils/token-program";

/**
 * claim_refund Instruction
 *
 * Allows a participant to claim their refund from a cancelled pool.
 *
 * IDL account order:
 * 0. mint (writable)
 * 1. pool (writable)
 * 2. pool_token (writable)
 * 3. user_token (writable)
 * 4. user (signer, writable)
 * 5. token_program
 * 6. participants (writable)
 *
 * Discriminator: [125, 176, 140, 160, 174, 124, 48, 232]
 */
export interface ClaimRefundInstructionParams {
  mint: PublicKey;
  pool: PublicKey;
  tokenProgramId: PublicKey;
  userPublicKey: PublicKey;
}

export function buildClaimRefundInstruction(params: ClaimRefundInstructionParams): TransactionInstruction {
  const [participantsPda] = deriveParticipantsPda(params.pool);
  const poolToken = derivePoolTokenAddress(params.mint, params.pool, params.tokenProgramId);
  const userToken = deriveAta(params.mint, params.userPublicKey, params.tokenProgramId);

  const discriminator = Buffer.from([125, 176, 140, 160, 174, 124, 48, 232]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.mint, isSigner: false, isWritable: true },
      { pubkey: params.pool, isSigner: false, isWritable: true },
      { pubkey: poolToken, isSigner: false, isWritable: true },
      { pubkey: userToken, isSigner: false, isWritable: true },
      { pubkey: params.userPublicKey, isSigner: true, isWritable: true },
      { pubkey: params.tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ],
    data: discriminator,
  });
}

/**
 * claim_rent Instruction
 *
 * Allows creator to reclaim SOL rent from a closed pool.
 *
 * IDL account order:
 * 0. pool (writable)
 * 1. creator (writable) - receives the rent
 * 2. user (signer, writable) - can be anyone after timeout
 * 3. system_program
 *
 * Discriminator: [166, 185, 38, 168, 219, 127, 112, 137]
 */
export interface ClaimRentInstructionParams {
  pool: PublicKey;
  creator: PublicKey; // From pool.creator
  userPublicKey: PublicKey; // The caller
}

export function buildClaimRentInstruction(params: ClaimRentInstructionParams): TransactionInstruction {
  const discriminator = Buffer.from([166, 185, 38, 168, 219, 127, 112, 137]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.pool, isSigner: false, isWritable: true },
      { pubkey: params.creator, isSigner: false, isWritable: true },
      { pubkey: params.userPublicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: discriminator,
  });
}

/**
 * admin_close_pool Instruction
 *
 * Admin can burn remaining pool funds and close the pool.
 *
 * IDL account order:
 * 0. mint (writable)
 * 1. pool (writable)
 * 2. pool_token (writable)
 * 3. user (signer, writable)
 * 4. token_program
 * 5. system_program
 * 6. participants (writable)
 *
 * Discriminator: [227, 138, 166, 48, 168, 165, 168, 209]
 */
export interface AdminClosePoolInstructionParams {
  mint: PublicKey;
  pool: PublicKey;
  tokenProgramId: PublicKey;
  userPublicKey: PublicKey;
}

export function buildAdminClosePoolInstruction(
  params: AdminClosePoolInstructionParams
): TransactionInstruction {
  const [participantsPda] = deriveParticipantsPda(params.pool);
  const poolToken = derivePoolTokenAddress(params.mint, params.pool, params.tokenProgramId);

  const discriminator = Buffer.from([227, 138, 166, 48, 168, 165, 168, 209]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.mint, isSigner: false, isWritable: true },
      { pubkey: params.pool, isSigner: false, isWritable: true },
      { pubkey: poolToken, isSigner: false, isWritable: true },
      { pubkey: params.userPublicKey, isSigner: true, isWritable: true },
      { pubkey: params.tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ],
    data: discriminator,
  });
}

/**
 * sweep_expired_pool Instruction
 *
 * Anyone can sweep an expired pool and burn funds.
 *
 * IDL account order:
 * 0. mint (writable)
 * 1. pool (writable)
 * 2. pool_token (writable)
 * 3. user (signer, writable)
 * 4. token_program
 * 5. system_program
 * 6. participants (writable)
 *
 * Discriminator: [152, 97, 215, 26, 247, 61, 252, 192]
 */
export interface SweepExpiredPoolInstructionParams {
  mint: PublicKey;
  pool: PublicKey;
  tokenProgramId: PublicKey;
  userPublicKey: PublicKey;
}

export function buildSweepExpiredPoolInstruction(
  params: SweepExpiredPoolInstructionParams
): TransactionInstruction {
  const [participantsPda] = deriveParticipantsPda(params.pool);
  const poolToken = derivePoolTokenAddress(params.mint, params.pool, params.tokenProgramId);

  const discriminator = Buffer.from([152, 97, 215, 26, 247, 61, 252, 192]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.mint, isSigner: false, isWritable: true },
      { pubkey: params.pool, isSigner: false, isWritable: true },
      { pubkey: poolToken, isSigner: false, isWritable: true },
      { pubkey: params.userPublicKey, isSigner: true, isWritable: true },
      { pubkey: params.tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ],
    data: discriminator,
  });
}

/**
 * finalize_forfeited_pool Instruction
 *
 * Closes a pool that was forfeited and sends funds to treasury.
 *
 * IDL account order:
 * 0. mint (writable)
 * 1. pool (writable)
 * 2. pool_token (writable)
 * 3. treasury_token (writable)
 * 4. user (signer, writable)
 * 5. token_program
 * 6. system_program
 * 7. participants (writable)
 *
 * Discriminator: [214, 35, 193, 33, 140, 13, 221, 5]
 */
export interface FinalizeForfeitedPoolInstructionParams {
  mint: PublicKey;
  pool: PublicKey;
  tokenProgramId: PublicKey;
  treasuryWallet: PublicKey;
  userPublicKey: PublicKey;
}

export function buildFinalizeForfeitedPoolInstruction(
  params: FinalizeForfeitedPoolInstructionParams
): TransactionInstruction {
  const [participantsPda] = deriveParticipantsPda(params.pool);
  const poolToken = derivePoolTokenAddress(params.mint, params.pool, params.tokenProgramId);
  const treasuryToken = deriveAta(params.mint, params.treasuryWallet, params.tokenProgramId);

  const discriminator = Buffer.from([214, 35, 193, 33, 140, 13, 221, 5]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.mint, isSigner: false, isWritable: true },
      { pubkey: params.pool, isSigner: false, isWritable: true },
      { pubkey: poolToken, isSigner: false, isWritable: true },
      { pubkey: treasuryToken, isSigner: false, isWritable: true },
      { pubkey: params.userPublicKey, isSigner: true, isWritable: true },
      { pubkey: params.tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ],
    data: discriminator,
  });
}
