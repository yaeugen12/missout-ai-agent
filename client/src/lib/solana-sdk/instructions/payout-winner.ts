/**
 * payout_winner Instruction Builder
 *
 * Builds the instruction to distribute pool funds to winner, dev, treasury, with burns.
 * This is one of the most complex instructions with init_if_needed for winner_token.
 */

import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

import { PROGRAM_ID } from "../programs/program-id";
import { deriveParticipantsPda, derivePoolTokenAddress, deriveAta } from "../utils/token-program";

export interface PayoutWinnerInstructionParams {
  mint: PublicKey;
  pool: PublicKey;
  tokenProgramId: PublicKey;
  winnerPubkey: PublicKey;
  devWallet: PublicKey;
  treasuryWallet: PublicKey;
  userPublicKey: PublicKey; // The caller (dev or anyone after timeout)
}

/**
 * Builds the payout_winner instruction.
 *
 * IDL account order:
 * 0. mint (writable)
 * 1. pool (writable, has_one = mint)
 * 2. pool_token (writable)
 * 3. winner_token (writable, init_if_needed) ← CRITICAL: Uses associated_token constraints
 * 4. dev_token (writable)
 * 5. treasury_token (writable)
 * 6. token_program
 * 7. associated_token_program
 * 8. system_program
 * 9. winner_pubkey (unchecked, validated against pool.winner)
 * 10. user (signer, writable) - the caller who pays for winner ATA if needed
 * 11. participants (writable)
 *
 * Discriminator: [191, 195, 65, 137, 244, 197, 48, 193]
 */
export function buildPayoutWinnerInstruction(
  params: PayoutWinnerInstructionParams
): TransactionInstruction {
  const [participantsPda] = deriveParticipantsPda(params.pool);
  const poolToken = derivePoolTokenAddress(params.mint, params.pool, params.tokenProgramId);
  const winnerToken = deriveAta(params.mint, params.winnerPubkey, params.tokenProgramId);
  const devToken = deriveAta(params.mint, params.devWallet, params.tokenProgramId);
  const treasuryToken = deriveAta(params.mint, params.treasuryWallet, params.tokenProgramId);

  // Payout winner has no instruction args (empty data)
  const discriminator = Buffer.from([191, 195, 65, 137, 244, 197, 48, 193]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.mint, isSigner: false, isWritable: true },
      { pubkey: params.pool, isSigner: false, isWritable: true },
      { pubkey: poolToken, isSigner: false, isWritable: true },
      { pubkey: winnerToken, isSigner: false, isWritable: true }, // init_if_needed by Anchor
      { pubkey: devToken, isSigner: false, isWritable: true },
      { pubkey: treasuryToken, isSigner: false, isWritable: true },
      { pubkey: params.tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: params.winnerPubkey, isSigner: false, isWritable: false },
      { pubkey: params.userPublicKey, isSigner: true, isWritable: true },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ],
    data: discriminator,
  });
}
