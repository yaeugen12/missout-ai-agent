/**
 * Simple Instruction Builders (no token operations)
 *
 * These instructions don't involve token transfers, so they don't need
 * tokenProgramId or ATA derivations. They operate purely on program state.
 */

import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

import { PROGRAM_ID } from "../programs/program-id";
import { deriveParticipantsPda, derivePoolTokenAddress } from "../utils/token-program";

/**
 * unlock_pool Instruction
 *
 * Transitions pool from Locked to Unlocked state.
 *
 * IDL account order:
 * 0. pool (writable)
 * 1. user (signer, writable)
 * 2. participants
 *
 * Discriminator: [51, 19, 234, 156, 255, 183, 89, 254]
 */
export function buildUnlockPoolInstruction(pool: PublicKey, userPublicKey: PublicKey): TransactionInstruction {
  const [participantsPda] = deriveParticipantsPda(pool);

  const discriminator = Buffer.from([51, 19, 234, 156, 255, 183, 89, 254]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: userPublicKey, isSigner: true, isWritable: true },
      { pubkey: participantsPda, isSigner: false, isWritable: false },
    ],
    data: discriminator,
  });
}

/**
 * pause_pool Instruction
 *
 * Pauses the pool (admin only).
 *
 * IDL account order:
 * 0. pool (writable)
 * 1. user (signer)
 *
 * Discriminator: [108, 113, 75, 29, 166, 32, 254, 8]
 */
export function buildPausePoolInstruction(pool: PublicKey, userPublicKey: PublicKey): TransactionInstruction {
  const discriminator = Buffer.from([108, 113, 75, 29, 166, 32, 254, 8]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: userPublicKey, isSigner: true, isWritable: false },
    ],
    data: discriminator,
  });
}

/**
 * unpause_pool Instruction
 *
 * Unpauses the pool (admin only).
 *
 * IDL account order:
 * 0. pool (writable)
 * 1. user (signer)
 *
 * Discriminator: [130, 110, 109, 75, 197, 49, 195, 147]
 */
export function buildUnpausePoolInstruction(pool: PublicKey, userPublicKey: PublicKey): TransactionInstruction {
  const discriminator = Buffer.from([130, 110, 109, 75, 197, 49, 195, 147]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: userPublicKey, isSigner: true, isWritable: false },
    ],
    data: discriminator,
  });
}

/**
 * force_expire Instruction
 *
 * Forces immediate expiration of pool (dev only).
 *
 * IDL account order:
 * 0. pool (writable)
 * 1. user (signer, writable)
 * 2. participants
 *
 * Discriminator: [248, 104, 58, 13, 65, 44, 185, 153]
 */
export function buildForceExpireInstruction(pool: PublicKey, userPublicKey: PublicKey): TransactionInstruction {
  const [participantsPda] = deriveParticipantsPda(pool);

  const discriminator = Buffer.from([248, 104, 58, 13, 65, 44, 185, 153]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: userPublicKey, isSigner: true, isWritable: true },
      { pubkey: participantsPda, isSigner: false, isWritable: false },
    ],
    data: discriminator,
  });
}

/**
 * set_lock_duration Instruction
 *
 * Updates the lock duration for an open pool (creator only).
 *
 * IDL account order:
 * 0. pool (writable)
 * 1. user (signer)
 *
 * Args: new_lock_duration i64 (8 bytes)
 *
 * Discriminator: [120, 255, 248, 113, 194, 147, 2, 216]
 */
export function buildSetLockDurationInstruction(
  pool: PublicKey,
  userPublicKey: PublicKey,
  newLockDuration: number // seconds, will be serialized as i64
): TransactionInstruction {
  const dataBuffer = Buffer.alloc(8);
  dataBuffer.writeBigInt64LE(BigInt(newLockDuration), 0);

  const discriminator = Buffer.from([120, 255, 248, 113, 194, 147, 2, 216]);
  const fullData = Buffer.concat([discriminator, dataBuffer]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: userPublicKey, isSigner: true, isWritable: false },
    ],
    data: fullData,
  });
}

/**
 * cancel_pool Instruction
 *
 * Cancels an open pool and burns all tokens (creator only).
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
 * Discriminator: [211, 11, 27, 100, 252, 115, 57, 77]
 */
export function buildCancelPoolInstruction(
  mint: PublicKey,
  pool: PublicKey,
  tokenProgramId: PublicKey,
  userPublicKey: PublicKey
): TransactionInstruction {
  const [participantsPda] = deriveParticipantsPda(pool);
  const poolToken = derivePoolTokenAddress(mint, pool, tokenProgramId);

  const discriminator = Buffer.from([211, 11, 27, 100, 252, 115, 57, 77]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: poolToken, isSigner: false, isWritable: true },
      { pubkey: userPublicKey, isSigner: true, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ],
    data: discriminator,
  });
}
