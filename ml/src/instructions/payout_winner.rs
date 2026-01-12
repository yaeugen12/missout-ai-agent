use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token_interface::{
        Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked, BurnChecked,
        burn_checked,
    },
};

use crate::{
    constants::*,
    errors::ErrorCode,
    events::*,
    state::{ActionType, Participants, PoolStatus},
    utils::validate_token_account,
};

#[derive(Accounts)]
pub struct PayoutWinner<'info> {
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, has_one = mint)]
    pub pool: Box<Account<'info, crate::state::Pool>>,

    #[account(
        mut,
        constraint = pool_token.mint == mint.key() @ ErrorCode::InvalidMint,
        constraint = pool_token.owner == pool.key() @ ErrorCode::InvalidParticipantToken
    )]
    pub pool_token: Box<InterfaceAccount<'info, TokenAccount>>,

    // ✅ Dual-program safe: ATA managed by Anchor, works for SPL + Token-2022
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = winner_pubkey,
        associated_token::token_program = token_program
    )]
    pub winner_token: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub dev_token: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub treasury_token: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,

    /// CHECK: validated against pool.winner
    pub winner_pubkey: UncheckedAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"participants", pool.key().as_ref()],
        bump,
        constraint = participants.key() == pool.participants_account @ ErrorCode::InvalidParticipantsPda
    )]
    pub participants: Box<Account<'info, Participants>>,
}

pub fn payout_winner(ctx: Context<PayoutWinner>) -> Result<()> {
    // ✅ Critical: mint must belong to the same token program provided
    require_keys_eq!(
        *ctx.accounts.mint.to_account_info().owner,
        ctx.accounts.token_program.key(),
        ErrorCode::InvalidTokenProgram
    );

    let now = Clock::get()?;
    let now_ts = now.unix_timestamp;

    ctx.accounts.pool.assert_not_paused()?;

    require!(
        ctx.accounts.pool.status == PoolStatus::WinnerSelected,
        ErrorCode::InvalidPoolStatus
    );

    let participant_count = ctx.accounts.participants.count as u64;
    require!(participant_count > 0, ErrorCode::NoParticipants);

    let winner_pubkey = ctx.accounts.pool.winner;
    require!(winner_pubkey != ZERO_PUBKEY, ErrorCode::NoWinnerSelected);
    require_keys_eq!(
        winner_pubkey,
        ctx.accounts.winner_pubkey.key(),
        ErrorCode::InvalidWinnerPubkey
    );

    // Authorization: dev only until timeout (as you had)
    let is_timeout = now_ts > ctx.accounts.pool.unlock_time + PAYOUT_TIMEOUT;
    if !is_timeout {
        require_keys_eq!(
            ctx.accounts.user.key(),
            ctx.accounts.pool.dev_wallet,
            ErrorCode::Unauthorized
        );
    }

    // Validate ATA addresses for dev/treasury/winner (prevents spoofed accounts)
    let expected_dev_ata = associated_token::get_associated_token_address_with_program_id(
        &ctx.accounts.pool.dev_wallet,
        &ctx.accounts.mint.key(),
        &ctx.accounts.token_program.key(),
    );
    require_keys_eq!(
        expected_dev_ata,
        ctx.accounts.dev_token.key(),
        ErrorCode::InvalidParticipantToken
    );
    validate_token_account(
        &ctx.accounts.dev_token,
        &ctx.accounts.mint.key(),
        &ctx.accounts.pool.dev_wallet,
        true,
    )?;

    let expected_treasury_ata = associated_token::get_associated_token_address_with_program_id(
        &ctx.accounts.pool.treasury_wallet,
        &ctx.accounts.mint.key(),
        &ctx.accounts.token_program.key(),
    );
    require_keys_eq!(
        expected_treasury_ata,
        ctx.accounts.treasury_token.key(),
        ErrorCode::InvalidParticipantToken
    );
    validate_token_account(
        &ctx.accounts.treasury_token,
        &ctx.accounts.mint.key(),
        &ctx.accounts.pool.treasury_wallet,
        true,
    )?;

    let expected_winner_ata = associated_token::get_associated_token_address_with_program_id(
        &winner_pubkey,
        &ctx.accounts.mint.key(),
        &ctx.accounts.token_program.key(),
    );
    require_keys_eq!(
        expected_winner_ata,
        ctx.accounts.winner_token.key(),
        ErrorCode::InvalidParticipantToken
    );
    validate_token_account(
        &ctx.accounts.winner_token,
        &ctx.accounts.mint.key(),
        &winner_pubkey,
        true,
    )?;

    // Balance sanity
    let total = ctx.accounts.pool.total_amount;
    require_eq!(ctx.accounts.pool_token.amount, total, ErrorCode::SpoofedDonation);

    // Compute payouts
    let denominator = 10_000_u64;
    let dev_amount = total
        .checked_mul(ctx.accounts.pool.dev_fee_bps as u64)
        .ok_or(ErrorCode::Overflow)?
        / denominator;

    let burn_amount = total
        .checked_mul(ctx.accounts.pool.burn_fee_bps as u64)
        .ok_or(ErrorCode::Overflow)?
        / denominator;

    let treasury_amount = total
        .checked_mul(ctx.accounts.pool.treasury_fee_bps as u64)
        .ok_or(ErrorCode::Overflow)?
        / denominator;

    let paid = dev_amount
        .checked_add(burn_amount)
        .ok_or(ErrorCode::Overflow)?
        .checked_add(treasury_amount)
        .ok_or(ErrorCode::Overflow)?;

    let winner_amount = total.checked_sub(paid).ok_or(ErrorCode::Overflow)?;

    let pool_id = ctx.accounts.pool.pool_id;

    let seeds: &[&[u8]] = &[
        b"pool",
        ctx.accounts.pool.mint.as_ref(),
        ctx.accounts.pool.salt.as_ref(),
        &[ctx.accounts.pool.bump],
    ];

    let decimals = ctx.accounts.mint.decimals;

    // Winner transfer
    if winner_amount > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.pool_token.to_account_info(),
                    to: ctx.accounts.winner_token.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
                &[seeds],
            ),
            winner_amount,
            decimals,
        )?;
    }

    // Dev transfer
    if dev_amount > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.pool_token.to_account_info(),
                    to: ctx.accounts.dev_token.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
                &[seeds],
            ),
            dev_amount,
            decimals,
        )?;
    }

    // Treasury transfer
    if treasury_amount > 0 {
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
            treasury_amount,
            decimals,
        )?;
    }

    // Burn fee
    if burn_amount > 0 {
        burn_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                BurnChecked {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.pool_token.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[seeds],
            ),
            burn_amount,
            decimals,
        )?;
    }

    // Burn any dust left (optional but good for invariants)
    ctx.accounts.pool_token.reload()?;
    let pool_balance = ctx.accounts.pool_token.amount;

    if pool_balance > 0 {
        burn_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                BurnChecked {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.pool_token.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[seeds],
            ),
            pool_balance,
            decimals,
        )?;
    }

    ctx.accounts.pool_token.reload()?;
    require_eq!(ctx.accounts.pool_token.amount, 0, ErrorCode::PoolNotEmpty);

    // Finalize state
    ctx.accounts.participants.count = 0;
    ctx.accounts.pool.end_time = now.unix_timestamp;
    ctx.accounts.pool.status_reason = 0;
    ctx.accounts.pool.total_amount = 0;
    ctx.accounts.pool.status = PoolStatus::Ended;

    emit!(WinnerSelectedEvent {
        pool_id: ctx.accounts.pool.key(),
        numerical_pool_id: pool_id,
        winner: winner_pubkey,
        winner_amount,
        dev_amount,
        burn_amount,
        treasury_amount,
        randomness: ctx.accounts.pool.randomness,
    });

    emit!(PoolActivityEvent {
        pool_id: ctx.accounts.pool.key(),
        numerical_pool_id: pool_id,
        action: ActionType::Ended,
        amount: winner_amount,
        participant_rank: 0,
        dev_fee_percent: ctx.accounts.pool.dev_fee_bps,
        burn_fee_percent: ctx.accounts.pool.burn_fee_bps,
        treasury_fee_percent: ctx.accounts.pool.treasury_fee_bps,
    });

    emit!(PoolStateEvent {
        pool_id: ctx.accounts.pool.key(),
        numerical_pool_id: pool_id,
        status: PoolStatus::Ended,
        participant_count: 0,
        total_amount: 0,
        status_reason: 0,
    });

    Ok(())
}
