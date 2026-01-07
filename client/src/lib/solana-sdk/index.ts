export { PROGRAM_ID, SWITCHBOARD_PROGRAM_ID, SWITCHBOARD_QUEUE } from "./programs/program-id";
export { derivePoolPda, deriveParticipantsPda, derivePoolTokenAddress } from "./pda/derive";
export { getConnection, resetConnection, checkConnection } from "./connection";
export { TokenAmount, getTokenDecimals } from "./utils/token";
export { IDL, type MissoutLotteryIDL } from "./idl";
export {
  MissoutClient,
  getMissoutClient,
  type PoolState,
  type ParticipantsState
} from "./client";
export {
  // Original 9 instructions
  createPool,
  joinPool,
  donateToPool,
  cancelPool,
  claimRefund,
  unlockPool,
  requestRandomness,
  selectWinner,
  payoutWinner,
  // NEW 8 instructions
  adminClosePool,
  pausePool,
  unpausePool,
  forceExpire,
  finalizeForfeitedPool,
  sweepExpiredPool,
  claimRent,
  setLockDuration,
  // Batch claim functions
  claimRefundsBatch,
  claimRentsBatch,
  buildClaimRefundInstruction,
  buildClaimRentInstruction,
  // Fetch functions
  fetchPoolState,
  fetchParticipants,
  getPoolStatusString,
  // Types
  type CreatePoolParams,
  type JoinPoolParams,
  type DonateParams,
  type BatchClaimResult,
  type BatchClaimProgress,
} from "./services/pool-service";

// Event system exports
export {
  type MissoutEvent,
  type PoolActivityEvent,
  type PoolStateEvent,
  type WinnerSelectedEvent,
  type RefundClaimedEvent,
  type ForfeitedToTreasuryEvent,
  type RefundBurnedEvent,
  type RentClaimedEvent,
  type UIHintEvent,
  ActionType,
  HintType,
  EVENT_DISCRIMINATORS,
} from "./events/types";

export {
  EventListener,
  createEventListener,
} from "./events/listener";

// Error handling exports
export {
  MissoutErrorCode,
  MissoutError,
  ERROR_MESSAGES,
  parseProgramError,
  isPoolFullError,
  isUnauthorizedError,
  isPoolClosedError,
  isRandomnessError,
  isInvalidMintError,
  isPausedError,
  isInsufficientFundsError,
} from "./errors";
