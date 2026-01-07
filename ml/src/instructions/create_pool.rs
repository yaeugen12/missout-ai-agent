use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token::{self, Mint, Token, TokenAccount, Transfer},
};
use sha2::Digest;

use crate::{
    constants::*,
    errors::ErrorCode,
    events::*,
    state::{ActionType, Participants, Pool, PoolStatus},
    utils::validate_token_account,
};

#[derive(Accounts)]
#[instruction(salt: [u8; 32])]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool", mint.key().as_ref(), salt.as_ref()],
        bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = user_token.key() == associated_token::get_associated_token_address(&user.key(), &mint.key())
            @ ErrorCode::InvalidParticipantToken
    )]
    pub user_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = pool,
        associated_token::token_program = token_program
    )]
    pub pool_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,

    #[account(
        init,
        payer = user,
        space = 8 + Participants::INIT_SPACE,
        seeds = [b"participants", pool.key().as_ref()],
        bump,
    )]
    pub participants: Account<'info, Participants>,
}

pub fn create_pool(
    ctx: Context<CreatePool>,
    salt: [u8; 32],
    max_participants: u8,
    lock_duration: i64,
    amount: u64,
    dev_wallet: Pubkey,
    dev_fee_bps: u16,
    burn_fee_bps: u16,
    treasury_wallet: Pubkey,
    treasury_fee_bps: u16,
    allow_mock: bool,
) -> Result<()> {
    require!(!ctx.accounts.pool.initialized, ErrorCode::AlreadyInitialized);
    require!(
        dev_fee_bps + burn_fee_bps + treasury_fee_bps <= MAX_FEE_BPS,
        ErrorCode::ExcessiveFees
    );

    require!(
        ctx.accounts.mint.freeze_authority.is_none(),
        ErrorCode::MintHasFreezeAuthority
    );

    require!(
        ctx.accounts.mint.mint_authority.is_none()
            || ctx.accounts.mint.mint_authority.unwrap() == ZERO_PUBKEY,
        ErrorCode::MintHasMintAuthority
    );

    require_keys_eq!(
        *ctx.accounts.mint.to_account_info().owner,
        anchor_spl::token::ID,
        ErrorCode::InvalidTokenProgram
    );

    require_gt!(ctx.accounts.mint.supply, 0, ErrorCode::ZeroSupply);

    let decimals = ctx.accounts.mint.decimals;
    require!(
        (decimals == 6) || (decimals == 8) || (decimals == 9) || (decimals == 10),
        ErrorCode::InvalidDecimals
    );

    require!(
        max_participants as usize <= MAX_PARTICIPANTS,
        ErrorCode::TooManyParticipants
    );
    require!(max_participants >= 2, ErrorCode::InvalidParticipantRange);

    let min_native = MIN_BET_TOKENS
        .checked_mul(10_u64.pow(decimals as u32))
        .ok_or(ErrorCode::Overflow)?;
    require!(amount >= min_native, ErrorCode::InvalidAmount);

    require!(
        lock_duration >= MIN_LOCK_DURATION && lock_duration <= MAX_LOCK_DURATION,
        ErrorCode::InvalidLockDuration
    );

    let clock = Clock::get()?;
    let pool_key = ctx.accounts.pool.key();

    let pool_id = {
        let mut hasher = sha2::Sha256::new();
        hasher.update(salt);
        hasher.update(clock.slot.to_le_bytes());
        hasher.update(ctx.accounts.user.key().as_ref());
        let hash = hasher.finalize();
        let slice = &hash[0..8];
        require!(slice.len() == 8, ErrorCode::InvalidRandomness);
        u64::from_le_bytes(slice.try_into().unwrap())
    };

    ctx.accounts.pool.pool_id = pool_id;
    ctx.accounts.pool.salt = salt;
    ctx.accounts.pool.mint = ctx.accounts.mint.key();
    ctx.accounts.pool.creator = ctx.accounts.user.key();
    ctx.accounts.pool.start_time = clock.unix_timestamp;
    ctx.accounts.pool.duration = POOL_OPEN_DURATION;
    ctx.accounts.pool.expire_time = clock.unix_timestamp + POOL_OPEN_DURATION;
    ctx.accounts.pool.end_time = 0;
    ctx.accounts.pool.unlock_time = 0;
    ctx.accounts.pool.close_time = 0;
    ctx.accounts.pool.max_participants = max_participants;
    ctx.accounts.pool.lock_duration = lock_duration;
    ctx.accounts.pool.lock_start_time = 0;
    ctx.accounts.pool.amount = amount;
    ctx.accounts.pool.total_amount = amount;
    ctx.accounts.pool.total_volume = amount;
    ctx.accounts.pool.total_joins = 1;
    ctx.accounts.pool.total_donations = 0;
    ctx.accounts.pool.dev_wallet = dev_wallet;
    ctx.accounts.pool.dev_fee_bps = dev_fee_bps;
    ctx.accounts.pool.burn_fee_bps = burn_fee_bps;
    ctx.accounts.pool.treasury_wallet = treasury_wallet;
    ctx.accounts.pool.treasury_fee_bps = treasury_fee_bps;
    ctx.accounts.pool.randomness = 0;
    ctx.accounts.pool.randomness_account = ZERO_PUBKEY;
    ctx.accounts.pool.randomness_deadline_slot = 0;
    ctx.accounts.pool.bump = ctx.bumps.pool;
    ctx.accounts.pool.status = PoolStatus::Open;
    ctx.accounts.pool.status_reason = 0;
    ctx.accounts.pool.paused = false;
    ctx.accounts.pool.version = 1;
    ctx.accounts.pool.schema = 1;
    ctx.accounts.pool.allow_mock = allow_mock;
    ctx.accounts.pool.randomness_commit_slot = 0;
    ctx.accounts.pool.last_join_time = clock.unix_timestamp;

    let mut hasher = sha2::Sha256::new();
    hasher.update(salt);
    hasher.update(max_participants.to_le_bytes());
    hasher.update(lock_duration.to_le_bytes());
    hasher.update(amount.to_le_bytes());
    hasher.update(dev_wallet.as_ref());
    hasher.update(dev_fee_bps.to_le_bytes());
    hasher.update(burn_fee_bps.to_le_bytes());
    hasher.update(treasury_wallet.as_ref());
    hasher.update(treasury_fee_bps.to_le_bytes());
    hasher.update(ctx.accounts.pool.start_time.to_le_bytes());
    hasher.update(ctx.accounts.pool.duration.to_le_bytes());
    ctx.accounts.pool.config_hash = hasher.finalize().into();

    let expected_ata = associated_token::get_associated_token_address(
        &ctx.accounts.user.key(),
        &ctx.accounts.mint.key(),
    );
    require_keys_eq!(
        expected_ata,
        ctx.accounts.user_token.key(),
        ErrorCode::InvalidParticipantToken
    );

    validate_token_account(
        &ctx.accounts.user_token,
        &ctx.accounts.mint.key(),
        &ctx.accounts.user.key(),
        false,
    )?;

    require_gte!(
        ctx.accounts.user_token.amount,
        amount,
        ErrorCode::InsufficientFunds
    );

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

    ctx.accounts.participants.list[0] = ctx.accounts.user.key();
    ctx.accounts.participants.count = 1;
    ctx.accounts.pool.participants_account = ctx.accounts.participants.key();

    emit!(PoolStateEvent {
        pool_id: pool_key,
        numerical_pool_id: pool_id,
        status: PoolStatus::Open,
        participant_count: 1,
        total_amount: amount,
        status_reason: 0,
    });

    emit!(PoolActivityEvent {
        pool_id: pool_key,
        numerical_pool_id: pool_id,
        action: ActionType::Created,
        amount,
        participant_rank: 1,
        dev_fee_percent: dev_fee_bps,
        burn_fee_percent: burn_fee_bps,
        treasury_fee_percent: treasury_fee_bps,
    });

    ctx.accounts.pool.initialized = true;
    ctx.accounts.pool.winner = ZERO_PUBKEY;

    Ok(())
}
