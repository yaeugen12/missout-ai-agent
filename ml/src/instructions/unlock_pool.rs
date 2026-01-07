use anchor_lang::prelude::*;
use crate::{errors::ErrorCode, events::*, state::{Pool, PoolStatus, Participants, ActionType, HintType}};

#[derive(Accounts)]
pub struct UnlockPool<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [b"participants", pool.key().as_ref()],
        bump,
        constraint = participants.key() == pool.participants_account @ ErrorCode::InvalidParticipantsPda
    )]
    pub participants: Account<'info, Participants>,
}

pub fn unlock_pool(ctx: Context<UnlockPool>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    pool.assert_not_paused()?;

    require_keys_eq!(ctx.accounts.user.key(), pool.dev_wallet, ErrorCode::Unauthorized);
    require!(pool.status == PoolStatus::Locked, ErrorCode::InvalidPoolStatus);

    let now_ts = Clock::get()?.unix_timestamp;
    pool.assert_unlocked_time(now_ts)?;
    require!(pool.lock_start_time != 0, ErrorCode::InvalidLockDuration);

    pool.status = PoolStatus::Unlocked;
    pool.unlock_time = now_ts;
    pool.status_reason = 0;

    let participants_count = ctx.accounts.participants.count;

    emit!(PoolStateEvent {
        pool_id: pool.key(),
        numerical_pool_id: pool.pool_id,
        status: PoolStatus::Unlocked,
        participant_count: participants_count,
        total_amount: pool.total_amount,
        status_reason: 0,
    });

    emit!(PoolActivityEvent {
        pool_id: pool.key(),
        numerical_pool_id: pool.pool_id,
        action: ActionType::Unlocked,
        amount: 0,
        participant_rank: 0,
        dev_fee_percent: pool.dev_fee_bps,
        burn_fee_percent: pool.burn_fee_bps,
        treasury_fee_percent: pool.treasury_fee_bps,
    });

    emit!(UIHint { pool_id: pool.key(), hint: HintType::Unlocked });

    Ok(())
}
