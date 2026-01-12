/**
 * donate Instruction Builder
 *
 * Builds the instruction for donating tokens to a pool.
 */

import { PublicKey, TransactionInstruction } from "@solana/web3.js";

import { PROGRAM_ID } from "../programs/program-id";
import { deriveParticipantsPda, derivePoolTokenAddress, deriveAta } from "../utils/token-program";

export interface DonateInstructionParams {
  mint: PublicKey;
  pool: PublicKey;
  tokenProgramId: PublicKey;
  amount: bigint; // u64, lamports
  userPublicKey: PublicKey;
}

/**
 * Builds the donate instruction.
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
 * Discriminator: [121, 186, 218, 211, 73, 70, 196, 180]
 */
export function buildDonateInstruction(params: DonateInstructionParams): TransactionInstruction {
  const [participantsPda] = deriveParticipantsPda(params.pool);
  const poolToken = derivePoolTokenAddress(params.mint, params.pool, params.tokenProgramId);
  const userToken = deriveAta(params.mint, params.userPublicKey, params.tokenProgramId);

  // Serialize instruction args
  // Args: amount u64 (8 bytes)
  const dataBuffer = Buffer.alloc(8);
  dataBuffer.writeBigUInt64LE(params.amount, 0);

  // Prepend discriminator
  const discriminator = Buffer.from([121, 186, 218, 211, 73, 70, 196, 180]);
  const fullData = Buffer.concat([discriminator, dataBuffer]);

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
    data: fullData,
  });
}
