use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::get_associated_token_address_with_program_id,
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
pub struct JoinPool<'info> {
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

    #[account(
        mut,
        constraint = user_token.key()
            == get_associated_token_address_with_program_id(&user.key(), &mint.key(), &token_program.key())
            @ ErrorCode::InvalidParticipantToken
    )]
    pub user_token: InterfaceAccount<'info, TokenAccount>,

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

pub fn join_pool(ctx: Context<JoinPool>, amount: u64) -> Result<()> {
    // ✅ CRITICAL: prevent SPL-vs-Token2022 mismatch DoS
    require_keys_eq!(
        *ctx.accounts.mint.to_account_info().owner,
        ctx.accounts.token_program.key(),
        ErrorCode::InvalidTokenProgram
    );

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    let pool = &mut ctx.accounts.pool;

    // Must be initialized & not paused
    require!(pool.initialized, ErrorCode::UninitializedAccount);
    pool.assert_not_paused()?;

    // ✅ Hard time gate: don't allow joins after expiration
    // (Your old code relied only on status/lock_start_time)
    pool.assert_active_join_period(now)?;

    // Status gates
    require!(pool.can_join_status(), ErrorCode::PoolUnavailableForJoin);

    // Don't allow join after lock started (or if already unlocked path happened)
    require!(pool.lock_start_time == 0, ErrorCode::JoinClosedAfterUnlock);

    // ✅ FIX: pool token must match mint & be owned by pool PDA (extra safety)
    require_keys_eq!(ctx.accounts.pool_token.mint, ctx.accounts.mint.key(), ErrorCode::InvalidMint);
    require_keys_eq!(ctx.accounts.pool_token.owner, pool.key(), ErrorCode::InvalidParticipantToken);

    // ✅ FIX: Validate config hash to prevent parameter tampering
    let mut hasher = sha2::Sha256::new();
    hasher.update(pool.salt);
    hasher.update(pool.max_participants.to_le_bytes());
    hasher.update(pool.lock_duration.to_le_bytes());
    hasher.update(pool.amount.to_le_bytes());
    hasher.update(pool.dev_wallet.as_ref());
    hasher.update(pool.dev_fee_bps.to_le_bytes());
    hasher.update(pool.burn_fee_bps.to_le_bytes());
    hasher.update(pool.treasury_wallet.as_ref());
    hasher.update(pool.treasury_fee_bps.to_le_bytes());
    hasher.update(pool.start_time.to_le_bytes());
    hasher.update(pool.duration.to_le_bytes());
    let current_hash: [u8; 32] = hasher.finalize().into();
    require!(current_hash == pool.config_hash, ErrorCode::ConfigMismatch);

    // Amount checks (exact bet)
    let decimals = ctx.accounts.mint.decimals;
    let min_native = MIN_BET_TOKENS
        .checked_mul(10_u64.pow(decimals as u32))
        .ok_or(ErrorCode::Overflow)?;

    require!(amount == pool.amount, ErrorCode::InvalidAmount);
    require!(pool.amount >= min_native, ErrorCode::InvalidAmount);

    // ATA checks (prevents spoofed token account)
    let user_key = ctx.accounts.user.key();
    let expected_ata = get_associated_token_address_with_program_id(
        &user_key,
        &ctx.accounts.mint.key(),
        &ctx.accounts.token_program.key(),
    );
    require_keys_eq!(
        expected_ata,
        ctx.accounts.user_token.key(),
        ErrorCode::InvalidParticipantToken
    );

    // Validate user token account (owner/mint/frozen + optional strict)
    validate_token_account(
        &ctx.accounts.user_token,
        &ctx.accounts.mint.key(),
        &user_key,
        false,
    )?;

    // Balance check
    require_gte!(ctx.accounts.user_token.amount, amount, ErrorCode::InsufficientFunds);

    // ✅ FIX: Atomic check-and-increment (overflow-safe)
    let current_count = ctx.accounts.participants.count;
    let new_count = current_count.checked_add(1).ok_or(ErrorCode::Overflow)?;

    require!(
        new_count <= pool.max_participants,
        ErrorCode::MaxParticipantsReached
    );

    // Duplicate prevention
    require!(
        (0..current_count as usize).all(|i| ctx.accounts.participants.list[i] != user_key),
        ErrorCode::AlreadyParticipated
    );

    // Transfer (actual movement first)
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
        decimals,
    )?;

    // Update participants after transfer succeeds
    ctx.accounts.participants.list[current_count as usize] = user_key;
    ctx.accounts.participants.count = new_count;

    // Update pool accounting
    pool.total_amount = pool.total_amount.checked_add(amount).ok_or(ErrorCode::Overflow)?;
    pool.total_volume = pool.total_volume.checked_add(amount).ok_or(ErrorCode::Overflow)?;
    pool.total_joins = pool.total_joins.checked_add(1).ok_or(ErrorCode::Overflow)?;
    pool.last_join_time = now;

    let pool_id = pool.pool_id;
    let participants_count = ctx.accounts.participants.count;

    emit!(PoolStateEvent {
        pool_id: pool.key(),
        numerical_pool_id: pool_id,
        status: pool.status,
        participant_count: participants_count,
        total_amount: pool.total_amount,
        status_reason: 0,
    });

    emit!(PoolActivityEvent {
        pool_id: pool.key(),
        numerical_pool_id: pool_id,
        action: ActionType::Joined,
        amount,
        participant_rank: participants_count,
        dev_fee_percent: pool.dev_fee_bps,
        burn_fee_percent: pool.burn_fee_bps,
        treasury_fee_percent: pool.treasury_fee_bps,
    });

    // If max reached => lock immediately and start lock timer
    if participants_count == pool.max_participants {
        pool.status = PoolStatus::Locked;
        pool.status_reason = REASON_MAX_REACHED;
        pool.lock_start_time = now;

        emit!(PoolStateEvent {
            pool_id: pool.key(),
            numerical_pool_id: pool_id,
            status: PoolStatus::Locked,
            participant_count: participants_count,
            total_amount: pool.total_amount,
            status_reason: REASON_MAX_REACHED,
        });

        emit!(PoolActivityEvent {
            pool_id: pool.key(),
            numerical_pool_id: pool_id,
            action: ActionType::ReachedMax,
            amount: pool.total_amount,
            participant_rank: 0,
            dev_fee_percent: pool.dev_fee_bps,
            burn_fee_percent: pool.burn_fee_bps,
            treasury_fee_percent: pool.treasury_fee_bps,
        });

        emit!(UIHint {
            pool_id: pool.key(),
            hint: HintType::ReachedMax
        });
    }

    Ok(())
}
