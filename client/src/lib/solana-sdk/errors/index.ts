/**
 * Missout Lottery Program Error Codes
 * These match the error codes defined in the Anchor program IDL
 */

export enum MissoutErrorCode {
  // 6000-6009: Pool state errors
  PoolExpired = 6000,
  PoolNotExpired = 6001,
  PoolNotEmpty = 6002,
  NotCreator = 6003,
  NotDeveloper = 6004,
  Unauthorized = 6005,
  AlreadyParticipated = 6006,
  MaxParticipantsReached = 6007,
  PoolClosed = 6008,
  Overflow = 6009,

  // 6010-6019: Validation errors
  InvalidWinnerAccount = 6010,
  InvalidParticipantToken = 6011,
  InvalidMint = 6012,
  MintHasMintAuthority = 6013,
  MintHasFreezeAuthority = 6014,
  InvalidDecimals = 6015,
  ExcessiveFees = 6016,
  InvalidParticipantCount = 6017,
  InvalidRandomnessAccount = 6018,
  RandomnessNotResolved = 6019,

  // 6020-6029: Participants and randomness
  NoParticipants = 6020,
  InvalidPoolStatus = 6021,
  RandomnessAlreadySet = 6022,
  CannotDecreaseLockDuration = 6023,
  RandomnessNotCommitted = 6024,
  RandomnessNotRevealed = 6025,
  InvalidRandomness = 6026,
  TooManyParticipants = 6027,
  InvalidParticipantRange = 6028,
  InvalidAmount = 6029,

  // 6030-6039: Lock and timing
  InvalidLockDuration = 6030,
  PoolStillLocked = 6031,
  InvalidParticipantsPda = 6032,
  InsufficientFundsForBurn = 6033,
  InvalidTokenProgram = 6034,
  ZeroSupply = 6035,
  SpoofedDonation = 6036,
  InvalidWinnerPubkey = 6037,
  InvalidWinnerTokenOwner = 6038,
  ForbiddenExtension = 6039,

  // 6040-6049: Account state errors
  HasDelegate = 6040,
  HasCloseAuthority = 6041,
  Paused = 6042,
  ConfigMismatch = 6043,
  FrozenAccount = 6044,
  InsufficientFunds = 6045,
  UninitializedAccount = 6046,
  RandomnessExpired = 6047,
  AlreadyInitialized = 6048,
  PoolUnavailableForJoin = 6049,

  // 6050-6058: Join/donate restrictions
  PoolLockedForJoin = 6050,
  DustNotAllowed = 6051,
  JoinClosedAfterUnlock = 6052,
  DonateClosedAfterUnlock = 6053,
  TooEarlyForEmergency = 6054,
  NotParticipant = 6055,
  AlreadyEnded = 6056,
  CannotChangeAfterJoins = 6057,
  NoWinnerSelected = 6058,
}

/**
 * Error messages mapping
 */
export const ERROR_MESSAGES: Record<MissoutErrorCode, string> = {
  [MissoutErrorCode.PoolExpired]: "Pool has expired",
  [MissoutErrorCode.PoolNotExpired]: "Pool not expired",
  [MissoutErrorCode.PoolNotEmpty]: "Pool not empty",
  [MissoutErrorCode.NotCreator]: "Not creator",
  [MissoutErrorCode.NotDeveloper]: "Not developer",
  [MissoutErrorCode.Unauthorized]: "Unauthorized",
  [MissoutErrorCode.AlreadyParticipated]: "Already participated",
  [MissoutErrorCode.MaxParticipantsReached]: "Maximum participants reached",
  [MissoutErrorCode.PoolClosed]: "Pool is closed",
  [MissoutErrorCode.Overflow]: "Overflow",
  [MissoutErrorCode.InvalidWinnerAccount]: "Invalid winner account",
  [MissoutErrorCode.InvalidParticipantToken]: "Invalid participant token",
  [MissoutErrorCode.InvalidMint]: "Invalid mint",
  [MissoutErrorCode.MintHasMintAuthority]: "Mint has mint authority",
  [MissoutErrorCode.MintHasFreezeAuthority]: "Mint has freeze authority",
  [MissoutErrorCode.InvalidDecimals]: "Invalid decimals",
  [MissoutErrorCode.ExcessiveFees]: "Excessive fees",
  [MissoutErrorCode.InvalidParticipantCount]: "Invalid participant count",
  [MissoutErrorCode.InvalidRandomnessAccount]: "Invalid randomness account",
  [MissoutErrorCode.RandomnessNotResolved]: "Randomness not resolved",
  [MissoutErrorCode.NoParticipants]: "No participants",
  [MissoutErrorCode.InvalidPoolStatus]: "Invalid pool status",
  [MissoutErrorCode.RandomnessAlreadySet]: "Randomness already set",
  [MissoutErrorCode.CannotDecreaseLockDuration]: "Cannot decrease lock duration",
  [MissoutErrorCode.RandomnessNotCommitted]: "Randomness not committed",
  [MissoutErrorCode.RandomnessNotRevealed]: "Randomness not revealed",
  [MissoutErrorCode.InvalidRandomness]: "Invalid randomness",
  [MissoutErrorCode.TooManyParticipants]: "Too many participants",
  [MissoutErrorCode.InvalidParticipantRange]: "Invalid participant range",
  [MissoutErrorCode.InvalidAmount]: "Invalid amount",
  [MissoutErrorCode.InvalidLockDuration]: "Invalid lock duration",
  [MissoutErrorCode.PoolStillLocked]: "Pool is still locked",
  [MissoutErrorCode.InvalidParticipantsPda]: "Invalid participants PDA",
  [MissoutErrorCode.InsufficientFundsForBurn]: "Insufficient funds for burn",
  [MissoutErrorCode.InvalidTokenProgram]: "Invalid token program",
  [MissoutErrorCode.ZeroSupply]: "Zero supply",
  [MissoutErrorCode.SpoofedDonation]: "Spoofed donation",
  [MissoutErrorCode.InvalidWinnerPubkey]: "Invalid winner pubkey",
  [MissoutErrorCode.InvalidWinnerTokenOwner]: "Invalid winner token owner",
  [MissoutErrorCode.ForbiddenExtension]: "Mint has unsupported extensions",
  [MissoutErrorCode.HasDelegate]: "ATA has delegate",
  [MissoutErrorCode.HasCloseAuthority]: "ATA has close authority",
  [MissoutErrorCode.Paused]: "Pool is paused",
  [MissoutErrorCode.ConfigMismatch]: "Config mismatch",
  [MissoutErrorCode.FrozenAccount]: "Account is frozen",
  [MissoutErrorCode.InsufficientFunds]: "Insufficient funds",
  [MissoutErrorCode.UninitializedAccount]: "Uninitialized account",
  [MissoutErrorCode.RandomnessExpired]: "Randomness expired",
  [MissoutErrorCode.AlreadyInitialized]: "Account already initialized",
  [MissoutErrorCode.PoolUnavailableForJoin]: "Pool unavailable for join",
  [MissoutErrorCode.PoolLockedForJoin]: "Cannot join because lock has started",
  [MissoutErrorCode.DustNotAllowed]: "Dust not allowed",
  [MissoutErrorCode.JoinClosedAfterUnlock]: "Pool has already unlocked - joining closed",
  [MissoutErrorCode.DonateClosedAfterUnlock]: "Donations are closed after unlocking",
  [MissoutErrorCode.TooEarlyForEmergency]: "Too early for emergency finalize",
  [MissoutErrorCode.NotParticipant]: "Not participant",
  [MissoutErrorCode.AlreadyEnded]: "Pool already ended",
  [MissoutErrorCode.CannotChangeAfterJoins]: "Cannot change lock duration after participants joined",
  [MissoutErrorCode.NoWinnerSelected]: "No winner selected",
};

/**
 * Custom error class for Missout program errors
 */
export class MissoutError extends Error {
  code: MissoutErrorCode;
  programErrorCode: number;

  constructor(code: MissoutErrorCode, message?: string) {
    super(message || ERROR_MESSAGES[code] || `Unknown error (code: ${code})`);
    this.name = "MissoutError";
    this.code = code;
    this.programErrorCode = code;
  }
}

/**
 * Parse Anchor program error and convert to MissoutError
 */
export function parseProgramError(error: any): MissoutError | null {
  // Try to extract error code from various error formats
  let errorCode: number | undefined;

  if (error?.code !== undefined) {
    errorCode = error.code;
  } else if (error?.message) {
    // Try to parse from error message like "custom program error: 0x1770" (6000 in hex)
    const match = error.message.match(/custom program error: 0x([0-9a-fA-F]+)/);
    if (match) {
      errorCode = parseInt(match[1], 16);
    }

    // Try to parse from error message like "Error Code: PoolExpired"
    const nameMatch = error.message.match(/Error Code: (\w+)/);
    if (nameMatch) {
      const errorName = nameMatch[1];
      const foundCode = Object.entries(MissoutErrorCode).find(
        ([key]) => key === errorName
      );
      if (foundCode) {
        errorCode = foundCode[1] as number;
      }
    }
  }

  if (errorCode !== undefined && errorCode >= 6000 && errorCode <= 6058) {
    return new MissoutError(errorCode as MissoutErrorCode);
  }

  return null;
}

// ============================================================================
// Helper functions for common error checks
// ============================================================================

export function isPoolFullError(error: any): boolean {
  const parsed = parseProgramError(error);
  return parsed?.code === MissoutErrorCode.MaxParticipantsReached;
}

export function isUnauthorizedError(error: any): boolean {
  const parsed = parseProgramError(error);
  return (
    parsed?.code === MissoutErrorCode.Unauthorized ||
    parsed?.code === MissoutErrorCode.NotCreator ||
    parsed?.code === MissoutErrorCode.NotDeveloper
  );
}

export function isPoolClosedError(error: any): boolean {
  const parsed = parseProgramError(error);
  return (
    parsed?.code === MissoutErrorCode.PoolClosed ||
    parsed?.code === MissoutErrorCode.PoolExpired ||
    parsed?.code === MissoutErrorCode.AlreadyEnded
  );
}

export function isRandomnessError(error: any): boolean {
  const parsed = parseProgramError(error);
  return (
    parsed?.code === MissoutErrorCode.InvalidRandomnessAccount ||
    parsed?.code === MissoutErrorCode.RandomnessNotResolved ||
    parsed?.code === MissoutErrorCode.RandomnessNotCommitted ||
    parsed?.code === MissoutErrorCode.RandomnessExpired ||
    parsed?.code === MissoutErrorCode.InvalidRandomness
  );
}

export function isInvalidMintError(error: any): boolean {
  const parsed = parseProgramError(error);
  return (
    parsed?.code === MissoutErrorCode.InvalidMint ||
    parsed?.code === MissoutErrorCode.MintHasMintAuthority ||
    parsed?.code === MissoutErrorCode.MintHasFreezeAuthority ||
    parsed?.code === MissoutErrorCode.ForbiddenExtension
  );
}

export function isPausedError(error: any): boolean {
  const parsed = parseProgramError(error);
  return parsed?.code === MissoutErrorCode.Paused;
}

export function isInsufficientFundsError(error: any): boolean {
  const parsed = parseProgramError(error);
  return (
    parsed?.code === MissoutErrorCode.InsufficientFunds ||
    parsed?.code === MissoutErrorCode.InsufficientFundsForBurn
  );
}
