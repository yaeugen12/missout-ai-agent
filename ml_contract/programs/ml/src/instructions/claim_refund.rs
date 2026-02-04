use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::get_associated_token_address_with_program_id,
    token_interface::{
        Mint, TokenAccount, TokenInterface,
        TransferChecked, transfer_checked,
        Burn, burn,
    },
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
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut, has_one = mint @ ErrorCode::InvalidMint)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = pool_token.mint == mint.key() @ ErrorCode::InvalidMint,
        constraint = pool_token.owner == pool.key() @ ErrorCode::InvalidParticipantToken
    )]
    pub pool_token: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub user_token: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        constraint = treasury_token.key()
            == get_associated_token_address_with_program_id(
                &pool.treasury_wallet,
                &mint.key(),
                &token_program.key()
            )
            @ ErrorCode::InvalidParticipantToken
    )]
    pub treasury_token: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,

    #[account(
        mut,
        seeds = [b"participants", pool.key().as_ref()],
        bump,
        constraint = participants.key() == pool.participants_account
            @ ErrorCode::InvalidParticipantsPda
    )]
    pub participants: Box<Account<'info, Participants>>, // ✅ FIX
}

pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
    // Token program safety (SPL vs Token-2022)
    require_keys_eq!(
        *ctx.accounts.mint.to_account_info().owner,
        ctx.accounts.token_program.key(),
        ErrorCode::InvalidTokenProgram
    );

    // 🔒 SECURITY: Validate pool_token matches what's stored in pool
    require_keys_eq!(
        ctx.accounts.pool_token.key(),
        ctx.accounts.pool.pool_token,
        ErrorCode::PoolTokenMismatch
    );

    // 🔒 Reentrancy guard
    ctx.accounts.pool.assert_not_processing()?;

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

    let seeds: &[&[u8]] = &[
        b"pool",
        pool.mint.as_ref(),
        pool.salt.as_ref(),
        &[pool.bump],
    ];

    /* ================= DEV FORFEIT PATH ================= */

    if is_dev {
        require!(
            now > pool.close_time + FORFEIT_DELAY,
            ErrorCode::TooEarlyForEmergency
        );

        validate_token_account(
            &ctx.accounts.treasury_token,
            &pool.mint,
            &pool.treasury_wallet,
            true,
        )?;

        ctx.accounts.pool_token.reload()?;
        let pool_balance = ctx.accounts.pool_token.amount;

        if pool_balance > 0 {
            transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.pool_token.to_account_info(),
                        to: ctx.accounts.treasury_token.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                    },
                    &[seeds],
                ),
                pool_balance,
                ctx.accounts.mint.decimals,
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

    /* ================= USER REFUND PATH ================= */

    require_keys_eq!(
        ctx.accounts.user_token.key(),
        get_associated_token_address_with_program_id(
            &caller,
            &pool.mint,
            &ctx.accounts.token_program.key()
        ),
        ErrorCode::InvalidParticipantToken
    );

    validate_token_account(
        &ctx.accounts.user_token,
        &pool.mint,
        &caller,
        false,
    )?;

    let mut index: Option<usize> = None;
    for i in 0..ctx.accounts.participants.count as usize {
        if ctx.accounts.participants.list[i] == caller {
            index = Some(i);
            break;
        }
    }
    let index = index.ok_or(ErrorCode::NotParticipant)?;

    let bet = pool.amount;
    let burn_amount = if is_creator { bet / 20 } else { 0 };
    let refund_amount = bet.saturating_sub(burn_amount);

    if burn_amount > 0 {
        burn(
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

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.pool_token.to_account_info(),
                to: ctx.accounts.user_token.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
            &[seeds],
        ),
        refund_amount,
        ctx.accounts.mint.decimals,
    )?;

    emit!(RefundClaimedEvent {
        pool_id: pool.key(),
        user: caller,
        amount: refund_amount,
        burn_amount,
        reason: pool.status_reason,
    });

    // remove participant
    let count = ctx.accounts.participants.count as usize;
    for i in index..count - 1 {
        ctx.accounts.participants.list[i] =
            ctx.accounts.participants.list[i + 1];
    }
    ctx.accounts.participants.list[count - 1] = ZERO_PUBKEY;
    ctx.accounts.participants.count -= 1;

    Ok(())
}
