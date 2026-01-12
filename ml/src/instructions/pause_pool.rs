use anchor_lang::prelude::*;
use crate::{constants::*, errors::ErrorCode, events::*, state::{Pool, PoolStatus, Participants}};

#[derive(Accounts)]
pub struct PausePool<'info> {
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

pub fn pause_pool(ctx: Context<PausePool>) -> Result<()> {
    require_keys_eq!(ctx.accounts.user.key(), ctx.accounts.pool.dev_wallet, ErrorCode::Unauthorized);

    require!(
        ctx.accounts.pool.status != PoolStatus::Ended && ctx.accounts.pool.status != PoolStatus::Closed,
        ErrorCode::InvalidPoolStatus
    );

    ctx.accounts.pool.paused = true;
    ctx.accounts.pool.status_reason = REASON_PAUSED;

    let participants_count = ctx.accounts.participants.count;

    emit!(PoolStateEvent {
        pool_id: ctx.accounts.pool.key(),
        numerical_pool_id: ctx.accounts.pool.pool_id,
        status: ctx.accounts.pool.status,
        participant_count: participants_count,
        total_amount: ctx.accounts.pool.total_amount,
        status_reason: REASON_PAUSED,
    });

    Ok(())
}
