use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::{constants::*, errors::ErrorCode, events::*, state::{Pool, PoolStatus, ActionType}};

#[derive(Accounts)]
pub struct CancelPool<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(mut, has_one = mint @ ErrorCode::InvalidMint)]
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        constraint = pool_token.mint == mint.key() @ ErrorCode::InvalidMint,
        constraint = pool_token.owner == pool.key() @ ErrorCode::InvalidParticipantToken
    )]
    pub pool_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn cancel_pool(ctx: Context<CancelPool>) -> Result<()> {
    require!(ctx.accounts.pool.initialized, ErrorCode::UninitializedAccount);
    ctx.accounts.pool.assert_not_paused()?;
    ctx.accounts.pool.assert_owner(&ctx.accounts.user.key())?;
    ctx.accounts.pool.assert_open()?;

    let pool_id = ctx.accounts.pool.pool_id;

    ctx.accounts.pool.status = PoolStatus::Cancelled;
    ctx.accounts.pool.status_reason = REASON_CANCELLED;
    ctx.accounts.pool.close_time = Clock::get()?.unix_timestamp;

    emit!(PoolStateEvent {
        pool_id: ctx.accounts.pool.key(),
        numerical_pool_id: pool_id,
        status: PoolStatus::Cancelled,
        participant_count: 0,
        total_amount: 0,
        status_reason: REASON_CANCELLED,
    });

    emit!(PoolActivityEvent {
        pool_id: ctx.accounts.pool.key(),
        numerical_pool_id: pool_id,
        action: ActionType::Cancelled,
        amount: 0,
        participant_rank: 0,
        dev_fee_percent: ctx.accounts.pool.dev_fee_bps,
        burn_fee_percent: ctx.accounts.pool.burn_fee_bps,
        treasury_fee_percent: ctx.accounts.pool.treasury_fee_bps,
    });

    Ok(())
}
