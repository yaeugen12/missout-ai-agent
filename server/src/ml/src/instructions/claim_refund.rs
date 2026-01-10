use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token,
    token::{self, Burn, Mint, Token, TokenAccount, Transfer},
};

use crate::{
    constants::*,
    errors::ErrorCode,
    events::*,
    state::{Participants, Pool, PoolStatus},
    utils::validate_token_account,
};

#[derive(Accounts)]
pub struct ClaimRefund<'info> {
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
    pub user_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = treasury_token.key()
            == associated_token::get_associated_token_address(&pool.treasury_wallet, &mint.key())
            @ ErrorCode::InvalidParticipantToken
    )]
    pub treasury_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,

    #[account(
        mut,
        seeds = [b"participants", pool.key().as_ref()],
        bump,
        constraint = participants.key() == pool.participants_account @ ErrorCode::InvalidParticipantsPda
    )]
    pub participants: Account<'info, Participants>,
}

pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let now = Clock::get()?.unix_timestamp;

    require!(pool.status == PoolStatus::Cancelled, ErrorCode::InvalidPoolStatus);

    require!(
        pool.status_reason == REASON_CANCELLED
            || pool.status_reason == REASON_ADMIN_CLOSED
            || pool.status_reason == REASON_EXPIRED,
        ErrorCode::InvalidPoolStatus
    );

    let caller = ctx.accounts.user.key();
    let is_creator = caller == pool.creator;
    let is_dev = caller == pool.dev_wallet;

    let seeds = &[b"pool", pool.mint.as_ref(), pool.salt.as_ref(), &[pool.bump]];

    if is_dev {
        require!(now > pool.close_time + FORFEIT_DELAY, ErrorCode::TooEarlyForEmergency);

        validate_token_account(&ctx.accounts.treasury_token, &pool.mint, &pool.treasury_wallet, true)?;

        ctx.accounts.pool_token.reload()?;
        let pool_balance = ctx.accounts.pool_token.amount;

        if pool_balance > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.pool_token.to_account_info(),
                        to: ctx.accounts.treasury_token.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    &[seeds],
                ),
                pool_balance,
            )?;
        }

        ctx.accounts.pool_token.reload()?;
        require_eq!(ctx.accounts.pool_token.amount, 0, ErrorCode::PoolNotEmpty);

        ctx.accounts.participants.count = 0;

        emit!(ForfeitedToTreasury {
            pool_id: pool.key(),
            amount: pool_balance,
        });

        return Ok(());
    }

    require_keys_eq!(
        ctx.accounts.user_token.key(),
        associated_token::get_associated_token_address(&caller, &pool.mint),
        ErrorCode::InvalidParticipantToken
    );
    validate_token_account(&ctx.accounts.user_token, &pool.mint, &caller, false)?;

    let mut index_opt: Option<usize> = None;
    for (i, p) in ctx
        .accounts
        .participants
        .list
        .iter()
        .enumerate()
        .take(ctx.accounts.participants.count as usize)
    {
        if *p == caller {
            index_opt = Some(i);
            break;
        }
    }
    let index = index_opt.ok_or(ErrorCode::NotParticipant)?;

    let bet = pool.amount;
    let burn_amount = if is_creator { bet / 20 } else { 0 };
    let refund_amount = bet.saturating_sub(burn_amount);

    if burn_amount > 0 {
        token::burn(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.pool_token.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[seeds],
            ),
            burn_amount,
        )?;

        emit!(RefundBurned {
            user: caller,
            amount: burn_amount,
            reason: pool.status_reason,
        });
    }

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.pool_token.to_account_info(),
                to: ctx.accounts.user_token.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            &[seeds],
        ),
        refund_amount,
    )?;

    emit!(RefundClaimedEvent {
        pool_id: pool.key(),
        user: caller,
        amount: refund_amount,
        burn_amount,
        reason: pool.status_reason,
    });

    let count = ctx.accounts.participants.count as usize;
    for i in index..count - 1 {
        ctx.accounts.participants.list[i] = ctx.accounts.participants.list[i + 1];
    }
    ctx.accounts.participants.list[count - 1] = ZERO_PUBKEY;
    ctx.accounts.participants.count -= 1;

    Ok(())
}
