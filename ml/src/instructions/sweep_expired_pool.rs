use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::{constants::*, errors::ErrorCode, events::*, state::{Pool, PoolStatus, Participants, ActionType}};

#[derive(Accounts)]
pub struct SweepExpiredPool<'info> {
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
    #[account(
        seeds = [b"participants", pool.key().as_ref()],
        bump,
        constraint = participants.key() == pool.participants_account @ ErrorCode::InvalidParticipantsPda
    )]
    pub participants: Account<'info, Participants>,
}

pub fn sweep_expired_pool(ctx: Context<SweepExpiredPool>) -> Result<()> {
    ctx.accounts.pool.assert_not_paused()?;

    let now = Clock::get()?.unix_timestamp;
    let pool = &mut ctx.accounts.pool;

    let can_force = pool.allow_mock;
    let too_early = now <= pool.expire_time + SWEEP_DELAY;
    if too_early && !can_force {
        return err!(ErrorCode::PoolNotExpired);
    }

    require!(ctx.accounts.user.key() == pool.dev_wallet, ErrorCode::NotDeveloper);
    pool.assert_open()?;

    pool.status = PoolStatus::Cancelled;
    pool.status_reason = REASON_EXPIRED;
    pool.close_time = now;

    emit!(PoolStateEvent {
        pool_id: pool.key(),
        numerical_pool_id: pool.pool_id,
        status: PoolStatus::Cancelled,
        participant_count: ctx.accounts.participants.count,
        total_amount: pool.total_amount,
        status_reason: REASON_EXPIRED,
    });

    emit!(PoolActivityEvent {
        pool_id: pool.key(),
        numerical_pool_id: pool.pool_id,
        action: ActionType::Expired,
        amount: 0,
        participant_rank: 0,
        dev_fee_percent: pool.dev_fee_bps,
        burn_fee_percent: pool.burn_fee_bps,
        treasury_fee_percent: pool.treasury_fee_bps,
    });

    Ok(())
}
