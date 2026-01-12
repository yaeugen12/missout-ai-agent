use anchor_lang::prelude::*;

pub const MAX_PARTICIPANTS: usize = 20;
pub const MAX_FEE_BPS: u16 = 10000;
pub const ZERO_PUBKEY: Pubkey = Pubkey::new_from_array([0; 32]);
pub const MIN_BET_TOKENS: u64 = 20; // 20 tokens (human-readable)
pub const MIN_DONATE_TOKENS: u64 = 20; // 20 tokens (human-readable)
pub const MIN_LOCK_DURATION: i64 = 60;
pub const MAX_LOCK_DURATION: i64 = 43_200;
pub const POOL_OPEN_DURATION: i64 = 604_800;
pub const SWEEP_DELAY: i64 = 7 * 86_400;
pub const REASON_CANCELLED: u8 = 5;
pub const REASON_ADMIN_CLOSED: u8 = 6;
pub const REASON_EXPIRED: u8 = 1;
pub const REASON_PAUSED: u8 = 2;
pub const REASON_MAX_REACHED: u8 = 4;
pub const EMERGENCY_DELAY: i64 = 86_400;
pub const PAYOUT_TIMEOUT: i64 = 7 * 86_400;
pub const FORFEIT_DELAY: i64 = 30 * 86_400; // 30 days

// ============================================
// SWITCHBOARD ON-DEMAND PROGRAM IDS
// ============================================
// Mainnet Switchboard On-Demand Program ID
pub const SWITCHBOARD_MAINNET: Pubkey = pubkey!("SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv");
// Devnet Switchboard On-Demand Program ID
pub const SWITCHBOARD_DEVNET: Pubkey = pubkey!("Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2");
// Select based on build feature
#[cfg(feature = "mainnet")]
pub const SWITCHBOARD_ID: Pubkey = SWITCHBOARD_MAINNET;
#[cfg(not(feature = "mainnet"))] // default = devnet
pub const SWITCHBOARD_ID: Pubkey = SWITCHBOARD_DEVNET;
