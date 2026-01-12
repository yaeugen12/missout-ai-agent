use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::get_associated_token_address_with_program_id,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    constants::*,
    errors::ErrorCode,
    events::*,
    state::{ActionType, Participants, Pool, PoolStatus},
    utils::validate_token_account,
};

#[derive(Accounts)]
pub struct ForfeitUnclaimed<'info> {
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

    /// Treasury destination (must be treasury_wallet ATA)
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

    /// must be dev_wallet OR treasury_wallet
    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,

    #[account(
        mut,
        seeds = [b"participants", pool.key().as_ref()],
        bump,
        constraint = participants.key() == pool.participants_account @ ErrorCode::InvalidParticipantsPda
    )]
    pub participants: Account<'info, Participants>,
}

pub fn finalize_forfeited_pool(ctx: Context<ForfeitUnclaimed>) -> Result<()> {
    // ✅ CRITICAL: SPL vs Token-2022 mismatch protection
    require_keys_eq!(
        *ctx.accounts.mint.to_account_info().owner,
        ctx.accounts.token_program.key(),
        ErrorCode::InvalidTokenProgram
    );

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    let pool = &mut ctx.accounts.pool;

    require!(pool.initialized, ErrorCode::UninitializedAccount);
    pool.assert_not_paused()?;

    require!(pool.status == PoolStatus::Cancelled, ErrorCode::InvalidPoolStatus);
    require!(
        pool.status_reason == REASON_CANCELLED
            || pool.status_reason == REASON_ADMIN_CLOSED
            || pool.status_reason == REASON_EXPIRED,
        ErrorCode::InvalidPoolStatus
    );
    require!(pool.close_time != 0, ErrorCode::InvalidPoolStatus);

    // ✅ Delay gate (unless allow_mock is enabled)
    if now <= pool.close_time + FORFEIT_DELAY && !pool.allow_mock {
        return err!(ErrorCode::TooEarlyForEmergency);
    }

    // ✅ Authorization: dev_wallet or treasury_wallet
    let caller = ctx.accounts.user.key();
    require!(
        caller == pool.dev_wallet || caller == pool.treasury_wallet,
        ErrorCode::Unauthorized
    );

    // ✅ Validate token accounts strictly (no delegate/close authority, not frozen)
    validate_token_account(
        &ctx.accounts.pool_token,
        &pool.mint,
        &pool.key(),
        true,
    )?;
    validate_token_account(
        &ctx.accounts.treasury_token,
        &pool.mint,
        &pool.treasury_wallet,
        true,
    )?;

    // Transfer remaining funds to treasury
    ctx.accounts.pool_token.reload()?;
    let pool_balance = ctx.accounts.pool_token.amount;

    if pool_balance > 0 {
        let seeds: &[&[u8]] = &[
            b"pool",
            pool.mint.as_ref(),
            pool.salt.as_ref(),
            &[pool.bump],
        ];

        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.pool_token.to_account_info(),
                    to: ctx.accounts.treasury_token.to_account_info(),
                    authority: pool.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
                &[seeds],
            ),
            pool_balance,
            ctx.accounts.mint.decimals,
        )?;
    }

    // ✅ Invariant: pool token must be emptied
    ctx.accounts.pool_token.reload()?;
    require_eq!(ctx.accounts.pool_token.amount, 0, ErrorCode::PoolNotEmpty);

    // Wipe participants (prevents further refund claims after forfeiture window)
    let n = ctx.accounts.participants.count as usize;
    for i in 0..n {
        ctx.accounts.participants.list[i] = ZERO_PUBKEY;
    }
    ctx.accounts.participants.count = 0;

    // Close state
    pool.status = PoolStatus::Closed;
    pool.status_reason = 0;
    pool.close_time = now;
    pool.total_amount = 0;

    let pool_key = pool.key();
    let pool_id = pool.pool_id;

    emit!(PoolStateEvent {
        pool_id: pool_key,
        numerical_pool_id: pool_id,
        status: PoolStatus::Closed,
        participant_count: 0,
        total_amount: 0,
        status_reason: 0,
    });

    emit!(PoolActivityEvent {
        pool_id: pool_key,
        numerical_pool_id: pool_id,
        action: ActionType::Closed,
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
