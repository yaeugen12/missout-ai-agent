use anchor_lang::prelude::*;
use crate::{errors::ErrorCode, events::*, state::PoolStatus};

// Reuses the same accounts as PausePool
pub use super::pause_pool::PausePool;

pub fn unpause_pool(ctx: Context<PausePool>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.user.key(),
        ctx.accounts.pool.dev_wallet,
        ErrorCode::Unauthorized
    );
    require!(
        ctx.accounts.pool.status != PoolStatus::Ended
            && ctx.accounts.pool.status != PoolStatus::Closed,
        ErrorCode::InvalidPoolStatus
    );
    ctx.accounts.pool.paused = false;
    ctx.accounts.pool.status_reason = 0;
    let participants_count = ctx.accounts.participants.count;
    emit!(PoolStateEvent {
        pool_id: ctx.accounts.pool.key(),
        numerical_pool_id: ctx.accounts.pool.pool_id,
        status: ctx.accounts.pool.status,
        participant_count: participants_count,
        total_amount: ctx.accounts.pool.total_amount,
        status_reason: 0,
    });
    Ok(())
}
