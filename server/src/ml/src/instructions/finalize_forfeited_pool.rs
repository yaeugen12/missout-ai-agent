use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use crate::{constants::*, errors::ErrorCode, events::*, state::{Pool, PoolStatus, Participants, ActionType}};

#[derive(Accounts)]
pub struct ForfeitUnclaimed<'info> {
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

    /// Treasury destination
    #[account(mut)]
    pub treasury_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>, // must be dev_wallet or treasury_wallet

    pub token_program: Program<'info, Token>,

    #[account(
        mut,
        seeds = [b"participants", pool.key().as_ref()],
        bump,
        constraint = participants.key() == pool.participants_account @ ErrorCode::InvalidParticipantsPda
    )]
    pub participants: Account<'info, Participants>,
}

pub fn finalize_forfeited_pool(ctx: Context<ForfeitUnclaimed>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let pool_key = ctx.accounts.pool.key();
    let pool_info = ctx.accounts.pool.to_account_info();
    let pool_data = &ctx.accounts.pool;

    pool_data.assert_not_paused()?;
    require!(pool_data.status == PoolStatus::Cancelled, ErrorCode::InvalidPoolStatus);

    let can_force = pool_data.allow_mock;
    let too_early = now <= pool_data.close_time + FORFEIT_DELAY;
    if too_early && !can_force {
        return err!(ErrorCode::TooEarlyForEmergency);
    }

    let caller = ctx.accounts.user.key();
    require!(caller == pool_data.dev_wallet || caller == pool_data.treasury_wallet, ErrorCode::Unauthorized);

    ctx.accounts.pool_token.reload()?;
    let pool_balance = ctx.accounts.pool_token.amount;

    if pool_balance > 0 {
        let seeds = &[
            b"pool",
            pool_data.mint.as_ref(),
            pool_data.salt.as_ref(),
            &[pool_data.bump],
        ];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_token.to_account_info(),
                    to: ctx.accounts.treasury_token.to_account_info(),
                    authority: pool_info,
                },
                &[seeds],
            ),
            pool_balance,
        )?;
    }

    let pool = &mut ctx.accounts.pool;
    ctx.accounts.participants.count = 0;

    pool.status = PoolStatus::Closed;
    pool.status_reason = 0;
    pool.close_time = now;

    emit!(PoolActivityEvent {
        pool_id: pool_key,
        numerical_pool_id: pool.pool_id,
        action: ActionType::AdminClosed,
        amount: pool_balance,
        participant_rank: 0,
        dev_fee_percent: pool.dev_fee_bps,
        burn_fee_percent: pool.burn_fee_bps,
        treasury_fee_percent: pool.treasury_fee_bps,
    });

    emit!(ForfeitedToTreasury {
        pool_id: pool_key,
        amount: pool_balance,
    });

    Ok(())
}
