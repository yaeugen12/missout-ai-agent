/**
 * create_pool Instruction Builder
 *
 * Builds the instruction to create a new pool with dual token program support.
 */

import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { v4 as uuidv4 } from "uuid";

import { PROGRAM_ID } from "../programs/program-id";
import {
  derivePoolPda,
  deriveParticipantsPda,
  derivePoolTokenAddress,
  deriveAta,
} from "../utils/token-program";

export interface CreatePoolInstructionParams {
  mint: PublicKey;
  tokenProgramId: PublicKey;
  salt: Uint8Array;
  maxParticipants: number;
  lockDuration: number; // i64, seconds
  amount: bigint; // u64, lamports
  devWallet: PublicKey;
  devFeeBps: number; // u16
  burnFeeBps: number; // u16
  treasuryWallet: PublicKey;
  treasuryFeeBps: number; // u16
  userPublicKey: PublicKey;
}

/**
 * Generates a random 32-byte salt for pool creation.
 * Uses UUID v4 as entropy source.
 */
export function generateSalt(): Uint8Array {
  const uuid = uuidv4().replace(/-/g, "");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(uuid.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Builds the create_pool instruction.
 *
 * IDL account order:
 * 0. mint (writable)
 * 1. pool (writable, init)
 * 2. user_token (writable)
 * 3. user (signer, writable)
 * 4. pool_token (writable, init_if_needed)
 * 5. token_program
 * 6. associated_token_program
 * 7. system_program
 * 8. rent
 * 9. participants (writable, init)
 *
 * Discriminator: [233, 146, 209, 142, 207, 104, 64, 188]
 */
export function buildCreatePoolInstruction(params: CreatePoolInstructionParams): TransactionInstruction {
  const [poolPda] = derivePoolPda(params.mint, params.salt);
  const [participantsPda] = deriveParticipantsPda(poolPda);
  const poolToken = derivePoolTokenAddress(params.mint, poolPda, params.tokenProgramId);
  const userToken = deriveAta(params.mint, params.userPublicKey, params.tokenProgramId);

  // Serialize instruction args
  // Args: salt [u8;32], max_participants u8, lock_duration i64, amount u64,
  //       dev_wallet pubkey, dev_fee_bps u16, burn_fee_bps u16,
  //       treasury_wallet pubkey, treasury_fee_bps u16, allow_mock bool (deprecated, always false)
  // Total: 32 + 1 + 8 + 8 + 32 + 2 + 2 + 32 + 2 + 1 = 120 bytes
  const dataBuffer = Buffer.alloc(120);
  let offset = 0;

  Buffer.from(params.salt).copy(dataBuffer, offset);
  offset += 32;
  dataBuffer.writeUInt8(params.maxParticipants, offset);
  offset += 1;
  dataBuffer.writeBigInt64LE(BigInt(params.lockDuration), offset);
  offset += 8;
  dataBuffer.writeBigUInt64LE(params.amount, offset);
  offset += 8;
  Buffer.from(params.devWallet.toBytes()).copy(dataBuffer, offset);
  offset += 32;
  dataBuffer.writeUInt16LE(params.devFeeBps, offset);
  offset += 2;
  dataBuffer.writeUInt16LE(params.burnFeeBps, offset);
  offset += 2;
  Buffer.from(params.treasuryWallet.toBytes()).copy(dataBuffer, offset);
  offset += 32;
  dataBuffer.writeUInt16LE(params.treasuryFeeBps, offset);
  offset += 2;
  dataBuffer.writeUInt8(0, offset); // allowMock deprecated, always false

  // Prepend discriminator
  const discriminator = Buffer.from([233, 146, 209, 142, 207, 104, 64, 188]);
  const fullData = Buffer.concat([discriminator, dataBuffer]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.mint, isSigner: false, isWritable: true },
      { pubkey: poolPda, isSigner: false, isWritable: true },
      { pubkey: userToken, isSigner: false, isWritable: true },
      { pubkey: params.userPublicKey, isSigner: true, isWritable: true },
      { pubkey: poolToken, isSigner: false, isWritable: true },
      { pubkey: params.tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ],
    data: fullData,
  });
}

/**
 * Returns derived addresses for a create_pool transaction.
 * Useful for logging and debugging.
 */
export function getCreatePoolAddresses(
  mint: PublicKey,
  salt: Uint8Array,
  tokenProgramId: PublicKey,
  userPublicKey: PublicKey
): {
  poolPda: PublicKey;
  participantsPda: PublicKey;
  poolToken: PublicKey;
  userToken: PublicKey;
} {
  const [poolPda] = derivePoolPda(mint, salt);
  const [participantsPda] = deriveParticipantsPda(poolPda);
  const poolToken = derivePoolTokenAddress(mint, poolPda, tokenProgramId);
  const userToken = deriveAta(mint, userPublicKey, tokenProgramId);

  return { poolPda, participantsPda, poolToken, userToken };
}
