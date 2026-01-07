use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token,
    token::{self, Mint, Token, TokenAccount, Transfer},
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
    pub mint: Account<'info, Mint>,

    #[account(mut, has_one = mint @ ErrorCode::InvalidMint)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = pool_token.mint == mint.key() @ ErrorCode::InvalidMint,
        constraint = pool_token.owner == pool.key() @ ErrorCode::InvalidParticipantToken
    )]
    pub pool_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token.key() == associated_token::get_associated_token_address(&user.key(), &mint.key())
            @ ErrorCode::InvalidParticipantToken
    )]
    pub user_token: Account<'info, TokenAccount>,

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

pub fn join_pool(ctx: Context<JoinPool>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    ctx.accounts.pool.assert_not_paused()?;
    require!(
        ctx.accounts.pool.can_join_status(),
        ErrorCode::PoolUnavailableForJoin
    );
    require!(ctx.accounts.pool.lock_start_time == 0, ErrorCode::JoinClosedAfterUnlock);

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

    let decimals = ctx.accounts.mint.decimals;
    let min_native = MIN_BET_TOKENS * 10_u64.pow(decimals as u32);

    require!(amount == ctx.accounts.pool.amount, ErrorCode::InvalidAmount);
    require!(ctx.accounts.pool.amount >= min_native, ErrorCode::InvalidAmount);

    require_gte!(ctx.accounts.user_token.amount, amount, ErrorCode::InsufficientFunds);

    validate_token_account(
        &ctx.accounts.user_token,
        &ctx.accounts.mint.key(),
        &ctx.accounts.user.key(),
        false,
    )?;

    // FIX: Atomic check-and-increment to prevent race condition
    let current_count = ctx.accounts.participants.count;
    let new_count = current_count.checked_add(1).ok_or(ErrorCode::Overflow)?;

    require!(
        new_count <= ctx.accounts.pool.max_participants,
        ErrorCode::MaxParticipantsReached
    );

    require!(
        (0..current_count as usize)
            .all(|i| ctx.accounts.participants.list[i] != ctx.accounts.user.key()),
        ErrorCode::AlreadyParticipated
    );

    let user_key = ctx.accounts.user.key();
    let pool_id = ctx.accounts.pool.pool_id;

    let expected_ata = associated_token::get_associated_token_address(&user_key, &ctx.accounts.mint.key());
    require_keys_eq!(expected_ata, ctx.accounts.user_token.key(), ErrorCode::InvalidParticipantToken);

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token.to_account_info(),
                to: ctx.accounts.pool_token.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    // Update state atomically after transfer succeeds
    ctx.accounts.participants.list[current_count as usize] = user_key;
    ctx.accounts.participants.count = new_count;

    ctx.accounts.pool.total_amount = ctx
        .accounts
        .pool
        .total_amount
        .checked_add(amount)
        .ok_or(ErrorCode::Overflow)?;
    ctx.accounts.pool.total_volume = ctx
        .accounts
        .pool
        .total_volume
        .checked_add(amount)
        .ok_or(ErrorCode::Overflow)?;
    ctx.accounts.pool.total_joins += 1;
    ctx.accounts.pool.last_join_time = now;

    let participants_count = ctx.accounts.participants.count;

    emit!(PoolStateEvent {
        pool_id: ctx.accounts.pool.key(),
        numerical_pool_id: pool_id,
        status: ctx.accounts.pool.status,
        participant_count: participants_count,
        total_amount: ctx.accounts.pool.total_amount,
        status_reason: 0,
    });

    emit!(PoolActivityEvent {
        pool_id: ctx.accounts.pool.key(),
        numerical_pool_id: pool_id,
        action: ActionType::Joined,
        amount,
        participant_rank: participants_count,
        dev_fee_percent: ctx.accounts.pool.dev_fee_bps,
        burn_fee_percent: ctx.accounts.pool.burn_fee_bps,
        treasury_fee_percent: ctx.accounts.pool.treasury_fee_bps,
    });

    if ctx.accounts.participants.count == ctx.accounts.pool.max_participants {
        ctx.accounts.pool.status = PoolStatus::Locked;
        ctx.accounts.pool.status_reason = REASON_MAX_REACHED;

        // Set lock start time to current timestamp (exact lock duration)
        ctx.accounts.pool.lock_start_time = now;

        emit!(PoolStateEvent {
            pool_id: ctx.accounts.pool.key(),
            numerical_pool_id: pool_id,
            status: PoolStatus::Locked,
            participant_count: participants_count,
            total_amount: ctx.accounts.pool.total_amount,
            status_reason: REASON_MAX_REACHED,
        });

        emit!(PoolActivityEvent {
            pool_id: ctx.accounts.pool.key(),
            numerical_pool_id: pool_id,
            action: ActionType::ReachedMax,
            amount: ctx.accounts.pool.total_amount,
            participant_rank: 0,
            dev_fee_percent: ctx.accounts.pool.dev_fee_bps,
            burn_fee_percent: ctx.accounts.pool.burn_fee_bps,
            treasury_fee_percent: ctx.accounts.pool.treasury_fee_bps,
        });

        emit!(UIHint { pool_id: ctx.accounts.pool.key(), hint: HintType::ReachedMax });
    }

    Ok(())
}
