use anchor_lang::prelude::*;
use crate::{constants::*, errors::ErrorCode, state::{Pool, Participants}};

#[derive(Accounts)]
pub struct SetLockDuration<'info> {
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

pub fn set_lock_duration(ctx: Context<SetLockDuration>, new_lock_duration: i64) -> Result<()> {
    ctx.accounts.pool.assert_not_paused()?;
    ctx.accounts.pool.assert_owner(&ctx.accounts.user.key())?;
    ctx.accounts.pool.assert_open()?;

    require!(
        new_lock_duration >= MIN_LOCK_DURATION && new_lock_duration <= MAX_LOCK_DURATION,
        ErrorCode::InvalidLockDuration
    );

    require!(
        new_lock_duration >= ctx.accounts.pool.lock_duration,
        ErrorCode::CannotDecreaseLockDuration
    );

    require!(ctx.accounts.participants.count == 1, ErrorCode::CannotChangeAfterJoins);

    ctx.accounts.pool.lock_duration = new_lock_duration;
    Ok(())
}
