use anchor_lang::prelude::*;
use crate::{errors::ErrorCode, state::Pool};

#[derive(Accounts)]
pub struct ForceExpire<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    pub user: Signer<'info>,
}

pub fn force_expire(ctx: Context<ForceExpire>) -> Result<()> {
    // FIX: Require both allow_mock AND dev_wallet authorization
    require!(ctx.accounts.pool.allow_mock, ErrorCode::Unauthorized);
    require_keys_eq!(ctx.accounts.user.key(), ctx.accounts.pool.dev_wallet, ErrorCode::Unauthorized);

    let now = Clock::get()?.unix_timestamp;

    // FIX: Prevent immediate expiration, require minimum duration elapsed
    let min_elapsed = 300; // 5 minutes minimum
    require!(
        now >= ctx.accounts.pool.start_time + min_elapsed,
        ErrorCode::TooEarlyForEmergency
    );

    ctx.accounts.pool.expire_time = now - 10;
    ctx.accounts.pool.duration = 0;
    Ok(())
}
