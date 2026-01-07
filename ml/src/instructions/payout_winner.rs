use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token::{self, Burn, Mint, Token, TokenAccount, Transfer},
};
use anchor_spl::token::spl_token::state::AccountState;

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
    pub mint: Account<'info, Mint>,

    #[account(mut, has_one = mint)]
    pub pool: Account<'info, crate::state::Pool>,

    #[account(
        mut,
        constraint = pool_token.mint == mint.key() @ ErrorCode::InvalidMint,
        constraint = pool_token.owner == pool.key() @ ErrorCode::InvalidParticipantToken
    )]
    pub pool_token: Account<'info, TokenAccount>,

    #[account(mut)]
    /// CHECK: will be checked in code
    pub winner_token: AccountInfo<'info>,

    #[account(mut)]
    pub dev_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub treasury_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,

    #[account()]
    /// CHECK: Validated via `require_keys_eq!(winner_pubkey, pool.winner)`
    pub winner_pubkey: UncheckedAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"participants", pool.key().as_ref()],
        bump,
        constraint = participants.key() == pool.participants_account @ ErrorCode::InvalidParticipantsPda
    )]
    pub participants: Account<'info, Participants>,
}

pub fn payout_winner(ctx: Context<PayoutWinner>) -> Result<()> {
    let now = Clock::get()?;
    let now_ts = now.unix_timestamp;

    // OPTIMIZATION: Cheap checks first, expensive checks later
    ctx.accounts.pool.assert_not_paused()?;

    // FIX: Single status check (removed duplicate)
    require!(
        ctx.accounts.pool.status == PoolStatus::WinnerSelected,
        ErrorCode::InvalidPoolStatus
    );

    // Check participant count early (cheap)
    let participant_count = ctx.accounts.participants.count as u64;
    require!(participant_count > 0, ErrorCode::NoParticipants);

    // Winner validation (cheap)
    let winner_pubkey = ctx.accounts.pool.winner;
    require!(winner_pubkey != ZERO_PUBKEY, ErrorCode::NoWinnerSelected);
    require_keys_eq!(winner_pubkey, ctx.accounts.winner_pubkey.key(), ErrorCode::InvalidWinnerPubkey);

    // Authorization check
    let is_timeout = now_ts > ctx.accounts.pool.unlock_time + PAYOUT_TIMEOUT;
    if !is_timeout {
        require_keys_eq!(ctx.accounts.user.key(), ctx.accounts.pool.dev_wallet, ErrorCode::Unauthorized);
    }

    // Token account validations (expensive - do after cheap checks)
    let expected_dev_ata =
        associated_token::get_associated_token_address(&ctx.accounts.pool.dev_wallet, &ctx.accounts.mint.key());
    require_keys_eq!(expected_dev_ata, ctx.accounts.dev_token.key(), ErrorCode::InvalidParticipantToken);
    validate_token_account(&ctx.accounts.dev_token, &ctx.accounts.mint.key(), &ctx.accounts.pool.dev_wallet, true)?;

    let expected_treasury_ata =
        associated_token::get_associated_token_address(&ctx.accounts.pool.treasury_wallet, &ctx.accounts.mint.key());
    require_keys_eq!(expected_treasury_ata, ctx.accounts.treasury_token.key(), ErrorCode::InvalidParticipantToken);
    validate_token_account(
        &ctx.accounts.treasury_token,
        &ctx.accounts.mint.key(),
        &ctx.accounts.pool.treasury_wallet,
        true,
    )?;

    let pool_id = ctx.accounts.pool.pool_id;

    let expected_winner_ata =
        associated_token::get_associated_token_address(&winner_pubkey, &ctx.accounts.mint.key());
    require_keys_eq!(expected_winner_ata, ctx.accounts.winner_token.key(), ErrorCode::InvalidParticipantToken);

    let winner_token_info = &ctx.accounts.winner_token;

    let total = ctx.accounts.pool.total_amount;
    require_eq!(ctx.accounts.pool_token.amount, total, ErrorCode::SpoofedDonation);

    let denominator = 10_000_u64;
    let dev_amount = total * ctx.accounts.pool.dev_fee_bps as u64 / denominator;
    let burn_amount = total * ctx.accounts.pool.burn_fee_bps as u64 / denominator;
    let treasury_amount = total * ctx.accounts.pool.treasury_fee_bps as u64 / denominator;

    let paid = dev_amount
        .checked_add(burn_amount)
        .ok_or(ErrorCode::Overflow)?
        .checked_add(treasury_amount)
        .ok_or(ErrorCode::Overflow)?;

    let winner_amount = total.checked_sub(paid).ok_or(ErrorCode::Overflow)?;

    let _was_created = if winner_amount > 0 && winner_token_info.data_is_empty() {
        associated_token::create(CpiContext::new(
            ctx.accounts.associated_token_program.to_account_info(),
            associated_token::Create {
                payer: ctx.accounts.user.to_account_info(),
                associated_token: winner_token_info.clone(),
                authority: ctx.accounts.winner_pubkey.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
            },
        ))?;
        true
    } else if winner_amount > 0 {
        require_keys_eq!(*winner_token_info.owner, anchor_spl::token::ID, ErrorCode::InvalidTokenProgram);

        let winner_token_acc: TokenAccount =
            TokenAccount::try_deserialize(&mut &winner_token_info.data.borrow()[..])?;

        require!(winner_token_acc.state != AccountState::Frozen, ErrorCode::FrozenAccount);
        require_eq!(winner_token_acc.mint, ctx.accounts.mint.key(), ErrorCode::InvalidMint);
        require_eq!(winner_token_acc.owner, winner_pubkey, ErrorCode::InvalidParticipantToken);
        false
    } else {
        false
    };

    let seeds = &[
        b"pool",
        ctx.accounts.pool.mint.as_ref(),
        ctx.accounts.pool.salt.as_ref(),
        &[ctx.accounts.pool.bump],
    ];

    if winner_amount > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_token.to_account_info(),
                    to: winner_token_info.clone(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[seeds],
            ),
            winner_amount,
        )?;
    }

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.pool_token.to_account_info(),
                to: ctx.accounts.dev_token.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            &[seeds],
        ),
        dev_amount,
    )?;

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
        treasury_amount,
    )?;

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

    ctx.accounts.pool_token.reload()?;
    let pool_balance = ctx.accounts.pool_token.amount;

    if pool_balance > 0 {
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
            pool_balance,
        )?;
    }

    ctx.accounts.pool_token.reload()?;
    require_eq!(ctx.accounts.pool_token.amount, 0, ErrorCode::PoolNotEmpty);

    ctx.accounts.participants.count = 0;
    ctx.accounts.pool.end_time = now.unix_timestamp;
    ctx.accounts.pool.status_reason = 0;
    ctx.accounts.pool.total_amount = 0;

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

    ctx.accounts.pool.status = PoolStatus::Ended;

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
