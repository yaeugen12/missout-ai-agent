use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, Burn, burn, CloseAccount, close_account};
use crate::{constants::*, errors::ErrorCode, events::*, state::{Pool, PoolStatus, Participants, ActionType}};

#[derive(Accounts)]
pub struct ClaimRent<'info> {
    #[account(mut, close = close_target)]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        constraint = pool_token.mint == mint.key() @ ErrorCode::InvalidMint,
        constraint = pool_token.owner == pool.key() @ ErrorCode::InvalidParticipantToken
    )]
    pub pool_token: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: may be treasury_wallet if expired
    #[account(mut)]
    pub close_target: SystemAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,

    #[account(
        mut,
        close = close_target,
        seeds = [b"participants", pool.key().as_ref()],
        bump,
        constraint = participants.key() == pool.participants_account @ ErrorCode::InvalidParticipantsPda
    )]
    pub participants: Account<'info, Participants>,
}

pub fn claim_rent(ctx: Context<ClaimRent>) -> Result<()> {
    // CRITICAL: Validate mint.owner matches token_program to prevent program mismatch DoS
    require_keys_eq!(
        *ctx.accounts.mint.to_account_info().owner,
        ctx.accounts.token_program.key(),
        ErrorCode::InvalidTokenProgram
    );

    let pool = &mut ctx.accounts.pool;
    let now = Clock::get()?.unix_timestamp;

    require!(
        pool.status == PoolStatus::Ended
            || pool.status == PoolStatus::Cancelled
            || pool.status == PoolStatus::Closed
            || pool.status == PoolStatus::WinnerSelected,
        ErrorCode::InvalidPoolStatus
    );

    require!(ctx.accounts.participants.count == 0, ErrorCode::PoolNotEmpty);

    let caller = ctx.accounts.user.key();
    let is_creator = caller == pool.creator;
    let is_dev = caller == pool.dev_wallet;

    require!(is_creator || is_dev, ErrorCode::Unauthorized);

    let rent_recipient = if is_dev {
        require!(now > pool.close_time + FORFEIT_DELAY, ErrorCode::TooEarlyForEmergency);
        pool.treasury_wallet
    } else {
        pool.creator
    };

    require_keys_eq!(ctx.accounts.close_target.key(), rent_recipient, ErrorCode::Unauthorized);

    let seeds = &[b"pool", pool.mint.as_ref(), pool.salt.as_ref(), &[pool.bump]];

    ctx.accounts.pool_token.reload()?;

    if pool.status == PoolStatus::Cancelled {
        let pool_balance = ctx.accounts.pool_token.amount;

        if pool_balance > 0 {
            burn(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Burn {
                        mint: ctx.accounts.mint.to_account_info(),
                        from: ctx.accounts.pool_token.to_account_info(),
                        authority: pool.to_account_info(),
                    },
                    &[seeds],
                ),
                pool_balance,
            )?;
        }

        ctx.accounts.pool_token.reload()?;
        require_eq!(ctx.accounts.pool_token.amount, 0, ErrorCode::PoolNotEmpty);
    } else {
        require_eq!(ctx.accounts.pool_token.amount, 0, ErrorCode::PoolNotEmpty);
    }

    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.pool_token.to_account_info(),
            destination: ctx.accounts.close_target.to_account_info(),
            authority: pool.to_account_info(),
        },
        &[seeds],
    ))?;

    pool.status = PoolStatus::Closed;
    pool.status_reason = 0;
    pool.close_time = Clock::get()?.unix_timestamp;

    emit!(PoolStateEvent {
        pool_id: pool.key(),
        numerical_pool_id: pool.pool_id,
        status: PoolStatus::Closed,
        participant_count: 0,
        total_amount: 0,
        status_reason: 0,
    });

    emit!(PoolActivityEvent {
        pool_id: pool.key(),
        numerical_pool_id: pool.pool_id,
        action: ActionType::Closed,
        amount: 0,
        participant_rank: 0,
        dev_fee_percent: pool.dev_fee_bps,
        burn_fee_percent: pool.burn_fee_bps,
        treasury_fee_percent: pool.treasury_fee_bps,
    });

    emit!(RentClaimed {
        pool_id: pool.key(),
        caller,
        sent_to: rent_recipient,
        timestamp: now,
    });

    Ok(())
}
