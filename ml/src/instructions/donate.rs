use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked},
};
use sha2::Digest;

use crate::{
    constants::*,
    errors::ErrorCode,
    events::*,
    state::{ActionType, HintType, Participants, Pool, PoolStatus},
    utils::validate_token_account,
};

#[derive(Accounts)]
pub struct Donate<'info> {
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut, has_one = mint @ ErrorCode::InvalidMint)]
    pub pool: Account<'info, Pool>,

    #[account(mut, constraint = pool_token.mint == mint.key() && pool_token.owner == pool.key())]
    pub pool_token: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub user_token: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,

    #[account(
        seeds = [b"participants", pool.key().as_ref()],
        bump,
        constraint = participants.key() == pool.participants_account @ ErrorCode::InvalidParticipantsPda
    )]
    pub participants: Account<'info, Participants>,
}

pub fn donate(ctx: Context<Donate>, amount: u64) -> Result<()> {
    // CRITICAL: Validate mint.owner matches token_program to prevent program mismatch DoS
    require_keys_eq!(
        *ctx.accounts.mint.to_account_info().owner,
        ctx.accounts.token_program.key(),
        ErrorCode::InvalidTokenProgram
    );

    let now = Clock::get()?.unix_timestamp;

    require!(ctx.accounts.pool.initialized, ErrorCode::UninitializedAccount);
    ctx.accounts.pool.assert_not_paused()?;
    require!(
        ctx.accounts.pool.status != PoolStatus::Unlocked && ctx.accounts.pool.status != PoolStatus::Ended,
        ErrorCode::DonateClosedAfterUnlock
    );

    // FIX: Validate config hash to prevent parameter tampering
    let mut hasher = sha2::Sha256::new();
    hasher.update(ctx.accounts.pool.salt);
    hasher.update(ctx.accounts.pool.max_participants.to_le_bytes());
    hasher.update(ctx.accounts.pool.lock_duration.to_le_bytes());
    hasher.update(ctx.accounts.pool.amount.to_le_bytes());
    hasher.update(ctx.accounts.pool.dev_wallet.as_ref());
    hasher.update(ctx.accounts.pool.dev_fee_bps.to_le_bytes());
    hasher.update(ctx.accounts.pool.burn_fee_bps.to_le_bytes());
    hasher.update(ctx.accounts.pool.treasury_wallet.as_ref());
    hasher.update(ctx.accounts.pool.treasury_fee_bps.to_le_bytes());
    hasher.update(ctx.accounts.pool.start_time.to_le_bytes());
    hasher.update(ctx.accounts.pool.duration.to_le_bytes());
    let current_hash: [u8; 32] = hasher.finalize().into();
    require!(current_hash == ctx.accounts.pool.config_hash, ErrorCode::ConfigMismatch);

    validate_token_account(
        &ctx.accounts.user_token,
        &ctx.accounts.mint.key(),
        &ctx.accounts.user.key(),
        false,
    )?;

    ctx.accounts.pool.can_donate(now)?;

    let decimals = ctx.accounts.mint.decimals;
    let min_native = MIN_DONATE_TOKENS * 10_u64.pow(decimals as u32);
    require!(amount >= min_native, ErrorCode::InvalidAmount);

    require_gte!(ctx.accounts.user_token.amount, amount, ErrorCode::InsufficientFunds);

    validate_token_account(
        &ctx.accounts.user_token,
        &ctx.accounts.mint.key(),
        &ctx.accounts.user.key(),
        false,
    )?;

    require_eq!(ctx.accounts.pool_token.mint, ctx.accounts.mint.key(), ErrorCode::InvalidMint);
    require_eq!(ctx.accounts.pool_token.owner, ctx.accounts.pool.key(), ErrorCode::InvalidParticipantToken);

    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.user_token.to_account_info(),
                to: ctx.accounts.pool_token.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    ctx.accounts.pool.total_amount = ctx.accounts.pool.total_amount.checked_add(amount).ok_or(ErrorCode::Overflow)?;
    ctx.accounts.pool.total_volume = ctx.accounts.pool.total_volume.checked_add(amount).ok_or(ErrorCode::Overflow)?;
    ctx.accounts.pool.total_donations += 1;

    let participants_count = ctx.accounts.participants.count;

    emit!(PoolStateEvent {
        pool_id: ctx.accounts.pool.key(),
        numerical_pool_id: ctx.accounts.pool.pool_id,
        status: ctx.accounts.pool.status,
        participant_count: participants_count,
        total_amount: ctx.accounts.pool.total_amount,
        status_reason: 0,
    });

    emit!(PoolActivityEvent {
        pool_id: ctx.accounts.pool.key(),
        numerical_pool_id: ctx.accounts.pool.pool_id,
        action: ActionType::Donated,
        amount,
        participant_rank: 0,
        dev_fee_percent: ctx.accounts.pool.dev_fee_bps,
        burn_fee_percent: ctx.accounts.pool.burn_fee_bps,
        treasury_fee_percent: ctx.accounts.pool.treasury_fee_bps,
    });

    if now > ctx.accounts.pool.start_time + ctx.accounts.pool.duration - 60 {
        emit!(UIHint { pool_id: ctx.accounts.pool.key(), hint: HintType::NearExpire });
    }

    Ok(())
}
