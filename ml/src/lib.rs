use anchor_lang::prelude::*;

declare_id!("53oTPbfy559uTaJQAbuWeAN1TyWXK1KfxUsM2GPJtrJw");

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

// ✅ Anchor 0.31: #[program] caută crate::__client_accounts_*
// Dar în submodule ele sunt doar pub(crate), deci NU le re-exportăm public,
// ci le aducem la crate root cu pub(crate) use.
pub(crate) use instructions::admin_close_pool::__client_accounts_admin_close_pool;
pub(crate) use instructions::cancel_pool::__client_accounts_cancel_pool;
pub(crate) use instructions::claim_refund::__client_accounts_claim_refund;
pub(crate) use instructions::claim_rent::__client_accounts_claim_rent;
pub(crate) use instructions::create_pool::__client_accounts_create_pool;
pub(crate) use instructions::donate::__client_accounts_donate;
pub(crate) use instructions::finalize_forfeited_pool::__client_accounts_forfeit_unclaimed;
pub(crate) use instructions::force_expire::__client_accounts_force_expire;
pub(crate) use instructions::join_pool::__client_accounts_join_pool;
pub(crate) use instructions::pause_pool::__client_accounts_pause_pool;
pub(crate) use instructions::payout_winner::__client_accounts_payout_winner;
pub(crate) use instructions::request_randomness::__client_accounts_request_randomness;
pub(crate) use instructions::select_winner::__client_accounts_select_winner;
pub(crate) use instructions::set_lock_duration::__client_accounts_set_lock_duration;
pub(crate) use instructions::sweep_expired_pool::__client_accounts_sweep_expired_pool;
pub(crate) use instructions::unlock_pool::__client_accounts_unlock_pool;

// Accounts types “flat”
use crate::instructions::{
    AdminClosePool, CancelPool, ClaimRefund, ClaimRent, CreatePool, Donate, ForceExpire,
    ForfeitUnclaimed, JoinPool, PayoutWinner, PausePool, RequestRandomness, SelectWinner,
    SetLockDuration, SweepExpiredPool, UnlockPool,
};

#[program]
pub mod ml {
    use super::*;

    pub fn create_pool(
        ctx: Context<CreatePool>,
        salt: [u8; 32],
        max_participants: u8,
        lock_duration: i64,
        amount: u64,
        dev_wallet: Pubkey,
        dev_fee_bps: u16,
        burn_fee_bps: u16,
        treasury_wallet: Pubkey,
        treasury_fee_bps: u16,
        allow_mock: bool,
    ) -> Result<()> {
        crate::instructions::create_pool(
            ctx,
            salt,
            max_participants,
            lock_duration,
            amount,
            dev_wallet,
            dev_fee_bps,
            burn_fee_bps,
            treasury_wallet,
            treasury_fee_bps,
            allow_mock,
        )
    }

    pub fn join_pool(ctx: Context<JoinPool>, amount: u64) -> Result<()> {
        crate::instructions::join_pool(ctx, amount)
    }

    pub fn donate(ctx: Context<Donate>, amount: u64) -> Result<()> {
        crate::instructions::donate(ctx, amount)
    }

    pub fn set_lock_duration(ctx: Context<SetLockDuration>, new_lock_duration: i64) -> Result<()> {
        crate::instructions::set_lock_duration(ctx, new_lock_duration)
    }

    pub fn cancel_pool(ctx: Context<CancelPool>) -> Result<()> {
        crate::instructions::cancel_pool(ctx)
    }

    pub fn admin_close_pool(ctx: Context<AdminClosePool>) -> Result<()> {
        crate::instructions::admin_close_pool(ctx)
    }

    pub fn sweep_expired_pool(ctx: Context<SweepExpiredPool>) -> Result<()> {
        crate::instructions::sweep_expired_pool(ctx)
    }

    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        crate::instructions::claim_refund(ctx)
    }

    pub fn claim_rent(ctx: Context<ClaimRent>) -> Result<()> {
        crate::instructions::claim_rent(ctx)
    }

    pub fn unlock_pool(ctx: Context<UnlockPool>) -> Result<()> {
        crate::instructions::unlock_pool(ctx)
    }

    pub fn request_randomness(ctx: Context<RequestRandomness>) -> Result<()> {
        crate::instructions::request_randomness(ctx)
    }

    pub fn select_winner(ctx: Context<SelectWinner>) -> Result<()> {
        crate::instructions::select_winner(ctx)
    }

    pub fn payout_winner(ctx: Context<PayoutWinner>) -> Result<()> {
        crate::instructions::payout_winner(ctx)
    }

    pub fn pause_pool(ctx: Context<PausePool>) -> Result<()> {
        crate::instructions::pause_pool(ctx)
    }

    pub fn unpause_pool(ctx: Context<PausePool>) -> Result<()> {
        crate::instructions::unpause_pool(ctx)
    }

    pub fn force_expire(ctx: Context<ForceExpire>) -> Result<()> {
        crate::instructions::force_expire(ctx)
    }

    pub fn finalize_forfeited_pool(ctx: Context<ForfeitUnclaimed>) -> Result<()> {
        crate::instructions::finalize_forfeited_pool(ctx)
    }
}
