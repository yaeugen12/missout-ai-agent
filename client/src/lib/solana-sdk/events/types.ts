import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

// ============================================================================
// Event Types - Matching IDL event definitions
// ============================================================================

/**
 * Action types for PoolActivityEvent
 */
export enum ActionType {
  Created = "Created",
  Joined = "Joined",
  Donated = "Donated",
  Closed = "Closed",
  Ended = "Ended",
  Cancelled = "Cancelled",
  RandomnessCommitted = "RandomnessCommitted",
  RandomnessMockCommitted = "RandomnessMockCommitted",
  ReachedMax = "ReachedMax",
  Unlocked = "Unlocked",
  AdminClosed = "AdminClosed",
  EmergencyReveal = "EmergencyReveal",
  Expired = "Expired",
}

/**
 * Hint types for UIHint event
 */
export enum HintType {
  ReachedMax = "ReachedMax",
  NearExpire = "NearExpire",
  Unlocked = "Unlocked",
}

/**
 * Pool Activity Event - Tracks all pool activities
 * Discriminator: [116, 221, 203, 110, 114, 139, 97, 124]
 */
export interface PoolActivityEvent {
  pool: PublicKey;
  user: PublicKey;
  action: ActionType;
  amount: anchor.BN; // u64
  timestamp: anchor.BN; // i64
  participantCount: number; // u16
}

/**
 * Pool State Event - Tracks pool state changes
 * Discriminator: [72, 169, 77, 67, 172, 217, 3, 115]
 */
export interface PoolStateEvent {
  pool: PublicKey;
  oldStatus: any; // PoolStatus enum (as object like {open: {}})
  newStatus: any; // PoolStatus enum
  timestamp: anchor.BN; // i64
  reason: number; // u8
}

/**
 * Winner Selected Event
 * Discriminator: [7, 237, 192, 149, 90, 36, 98, 161]
 */
export interface WinnerSelectedEvent {
  pool: PublicKey;
  winner: PublicKey;
  totalAmount: anchor.BN; // u64
  participantCount: number; // u16
  randomness: anchor.BN; // u128
  timestamp: anchor.BN; // i64
}

/**
 * Refund Claimed Event
 * Discriminator: [77, 83, 172, 123, 235, 58, 154, 233]
 */
export interface RefundClaimedEvent {
  pool: PublicKey;
  user: PublicKey;
  amount: anchor.BN; // u64
  burnAmount: anchor.BN; // u64
  timestamp: anchor.BN; // i64
}

/**
 * Forfeited To Treasury Event - Pool funds forfeited to treasury
 * Discriminator: [39, 110, 130, 240, 19, 62, 31, 116]
 */
export interface ForfeitedToTreasuryEvent {
  pool: PublicKey;
  amount: anchor.BN; // u64
  treasury: PublicKey;
  timestamp: anchor.BN; // i64
  reason: string;
}

/**
 * Refund Burned Event - Tokens burned during refund
 * Discriminator: [54, 180, 75, 149, 111, 26, 28, 217]
 */
export interface RefundBurnedEvent {
  pool: PublicKey;
  user: PublicKey;
  amount: anchor.BN; // u64
  timestamp: anchor.BN; // i64
}

/**
 * Rent Claimed Event - Rent reclaimed from closed pool
 * Discriminator: [33, 17, 4, 27, 161, 78, 74, 45]
 */
export interface RentClaimedEvent {
  pool: PublicKey;
  claimedBy: PublicKey;
  amount: anchor.BN; // u64
  timestamp: anchor.BN; // i64
}

/**
 * UI Hint Event - Hints for UI updates
 * Discriminator: [172, 74, 74, 147, 181, 223, 105, 15]
 */
export interface UIHintEvent {
  pool: PublicKey;
  hintType: HintType;
  timestamp: anchor.BN; // i64
  data: any; // Generic data field
}

/**
 * Union type for all events
 */
export type MissoutEvent =
  | { type: "PoolActivityEvent"; data: PoolActivityEvent }
  | { type: "PoolStateEvent"; data: PoolStateEvent }
  | { type: "WinnerSelectedEvent"; data: WinnerSelectedEvent }
  | { type: "RefundClaimedEvent"; data: RefundClaimedEvent }
  | { type: "ForfeitedToTreasuryEvent"; data: ForfeitedToTreasuryEvent }
  | { type: "RefundBurnedEvent"; data: RefundBurnedEvent }
  | { type: "RentClaimedEvent"; data: RentClaimedEvent }
  | { type: "UIHintEvent"; data: UIHintEvent };

/**
 * Event discriminators mapping
 */
export const EVENT_DISCRIMINATORS = {
  PoolActivityEvent: [116, 221, 203, 110, 114, 139, 97, 124],
  PoolStateEvent: [72, 169, 77, 67, 172, 217, 3, 115],
  WinnerSelectedEvent: [7, 237, 192, 149, 90, 36, 98, 161],
  RefundClaimedEvent: [77, 83, 172, 123, 235, 58, 154, 233],
  ForfeitedToTreasuryEvent: [39, 110, 130, 240, 19, 62, 31, 116],
  RefundBurnedEvent: [54, 180, 75, 149, 111, 26, 28, 217],
  RentClaimedEvent: [33, 17, 4, 27, 161, 78, 74, 45],
  UIHintEvent: [172, 74, 74, 147, 181, 223, 105, 15],
} as const;
