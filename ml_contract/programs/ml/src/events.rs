use anchor_lang::prelude::*;
use crate::state::{PoolStatus, ActionType, HintType};

#[event]
pub struct PoolStateEvent {
    pub pool_id: Pubkey,
    pub numerical_pool_id: u64,
    pub status: PoolStatus,
    pub participant_count: u8,
    pub total_amount: u64,
    pub status_reason: u8,
}

#[event]
pub struct PoolActivityEvent {
    pub pool_id: Pubkey,
    pub numerical_pool_id: u64,
    pub action: ActionType,
    pub amount: u64,
    pub participant_rank: u8,
    pub dev_fee_percent: u16,
    pub burn_fee_percent: u16,
    pub treasury_fee_percent: u16,
}

#[event]
pub struct UIHint {
    pub pool_id: Pubkey,
    pub hint: HintType,
}

#[event]
pub struct RefundBurned {
    pub user: Pubkey,
    pub amount: u64,
    pub reason: u8,
}

#[event]
pub struct RentClaimed {
    pub pool_id: Pubkey,
    pub caller: Pubkey,
    pub sent_to: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct WinnerSelectedEvent {
    pub pool_id: Pubkey,
    pub numerical_pool_id: u64,
    pub winner: Pubkey,
    pub winner_amount: u64,
    pub dev_amount: u64,
    pub burn_amount: u64,
    pub treasury_amount: u64,
    pub randomness: u128,
}

#[event]
pub struct RefundClaimedEvent {
    pub pool_id: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub burn_amount: u64,
    pub reason: u8,
}

#[event]
pub struct ForfeitedToTreasury {
    pub pool_id: Pubkey,
    pub amount: u64,
}
