/**
 * Instruction Builders Index
 *
 * Central export point for all instruction builders supporting dual token programs.
 */

// Core token program helpers
export {
  resolveTokenProgramForMint,
  derivePoolPda,
  deriveParticipantsPda,
  deriveAta,
  derivePoolTokenAddress,
} from "../utils/token-program";

// Create pool
export {
  buildCreatePoolInstruction,
  generateSalt,
  getCreatePoolAddresses,
  type CreatePoolInstructionParams,
} from "./create-pool";

// Join and donate
export { buildJoinPoolInstruction, type JoinPoolInstructionParams } from "./join-pool";
export { buildDonateInstruction, type DonateInstructionParams } from "./donate";

// Payout
export {
  buildPayoutWinnerInstruction,
  type PayoutWinnerInstructionParams,
} from "./payout-winner";

// Simple state management
export {
  buildUnlockPoolInstruction,
  buildPausePoolInstruction,
  buildUnpausePoolInstruction,
  buildForceExpireInstruction,
  buildSetLockDurationInstruction,
  buildCancelPoolInstruction,
} from "./simple";

// Randomness and winner selection
export {
  buildRequestRandomnessInstruction,
  buildSelectWinnerInstruction,
  type RequestRandomnessInstructionParams,
  type SelectWinnerInstructionParams,
} from "./randomness";

// Claims and admin closure
export {
  buildClaimRefundInstruction,
  buildClaimRentInstruction,
  buildAdminClosePoolInstruction,
  buildSweepExpiredPoolInstruction,
  buildFinalizeForfeitedPoolInstruction,
  type ClaimRefundInstructionParams,
  type ClaimRentInstructionParams,
  type AdminClosePoolInstructionParams,
  type SweepExpiredPoolInstructionParams,
  type FinalizeForfeitedPoolInstructionParams,
} from "./claims";
