/**
 * Randomness and Winner Selection Instructions
 *
 * Instructions for integrating with Switchboard VRF for randomness.
 */

import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

import { PROGRAM_ID } from "../programs/program-id";
import { deriveParticipantsPda } from "../utils/token-program";

/**
 * request_randomness Instruction
 *
 * Requests VRF randomness from Switchboard.
 *
 * IDL account order:
 * 0. pool (writable)
 * 1. randomness_account_data (writable)
 * 2. switchboard_function (not used in mock)
 * 3. switchboard_request (writable, not used in mock)
 * 4. state (Switchboard state)
 * 5. switchboard_mint (Switchboard escrow mint)
 * 6. switchboard_wallet (writable, user's Switchboard token account)
 * 7. switchboard_escrow (writable, Switchboard escrow)
 * 8. switchboard_program (Switchboard program ID)
 * 9. user (signer, writable)
 * 10. token_program
 * 11. system_program
 * 12. participants
 *
 * Discriminator: [213, 5, 173, 166, 109, 63, 90, 212]
 */
export interface RequestRandomnessInstructionParams {
  pool: PublicKey;
  randomnessAccountData: PublicKey;
  switchboardFunction: PublicKey;
  switchboardRequest: PublicKey;
  switchboardState: PublicKey;
  switchboardMint: PublicKey;
  switchboardWallet: PublicKey;
  switchboardEscrow: PublicKey;
  switchboardProgram: PublicKey;
  userPublicKey: PublicKey;
  tokenProgramId: PublicKey;
}

export function buildRequestRandomnessInstruction(
  params: RequestRandomnessInstructionParams
): TransactionInstruction {
  const [participantsPda] = deriveParticipantsPda(params.pool);

  const discriminator = Buffer.from([213, 5, 173, 166, 109, 63, 90, 212]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.pool, isSigner: false, isWritable: true },
      { pubkey: params.randomnessAccountData, isSigner: false, isWritable: true },
      { pubkey: params.switchboardFunction, isSigner: false, isWritable: false },
      { pubkey: params.switchboardRequest, isSigner: false, isWritable: true },
      { pubkey: params.switchboardState, isSigner: false, isWritable: false },
      { pubkey: params.switchboardMint, isSigner: false, isWritable: false },
      { pubkey: params.switchboardWallet, isSigner: false, isWritable: true },
      { pubkey: params.switchboardEscrow, isSigner: false, isWritable: true },
      { pubkey: params.switchboardProgram, isSigner: false, isWritable: false },
      { pubkey: params.userPublicKey, isSigner: true, isWritable: true },
      { pubkey: params.tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: participantsPda, isSigner: false, isWritable: false },
    ],
    data: discriminator,
  });
}

/**
 * select_winner Instruction
 *
 * Selects winner using committed randomness.
 *
 * IDL account order:
 * 0. pool (writable)
 * 1. randomness_account_data
 * 2. user (signer, writable)
 * 3. system_program
 * 4. participants
 *
 * Discriminator: [197, 112, 137, 193, 245, 128, 30, 161]
 */
export interface SelectWinnerInstructionParams {
  pool: PublicKey;
  randomnessAccountData: PublicKey;
  userPublicKey: PublicKey;
}

export function buildSelectWinnerInstruction(
  params: SelectWinnerInstructionParams
): TransactionInstruction {
  const [participantsPda] = deriveParticipantsPda(params.pool);

  const discriminator = Buffer.from([197, 112, 137, 193, 245, 128, 30, 161]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.pool, isSigner: false, isWritable: true },
      { pubkey: params.randomnessAccountData, isSigner: false, isWritable: false },
      { pubkey: params.userPublicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: participantsPda, isSigner: false, isWritable: false },
    ],
    data: discriminator,
  });
}
