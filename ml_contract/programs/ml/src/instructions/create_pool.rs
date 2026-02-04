use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token_interface::{
        Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked,
    },
};
use sha2::Digest;

use crate::{
    constants::*,
    errors::ErrorCode,
    events::*,
    state::{ActionType, Participants, Pool, PoolStatus},
    utils::{validate_token_account, validate_token2022_mint},
};

#[derive(Accounts)]
#[instruction(salt: [u8; 32])]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool", mint.key().as_ref(), salt.as_ref()],
        bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        mut,
        constraint = user_token.key()
            == associated_token::get_associated_token_address_with_program_id(
                &user.key(),
                &mint.key(),
                &token_program.key()
            ) @ ErrorCode::InvalidParticipantToken
    )]
    pub user_token: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = pool,
        associated_token::token_program = token_program
    )]
    pub pool_token: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,

    /// kept for IDL / SDK compatibility
    pub rent: Sysvar<'info, Rent>,

    #[account(
        init,
        payer = user,
        space = 8 + Participants::INIT_SPACE,
        seeds = [b"participants", pool.key().as_ref()],
        bump
    )]
    pub participants: Box<Account<'info, Participants>>,
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
    let pool = &mut ctx.accounts.pool;

    require!(!pool.initialized, ErrorCode::AlreadyInitialized);

    // Token program safety (SPL vs Token-2022)
    require_keys_eq!(
        *ctx.accounts.mint.to_account_info().owner,
        ctx.accounts.token_program.key(),
        ErrorCode::InvalidTokenProgram
    );

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

    // Token-2022 extension validation
    validate_token2022_mint(&ctx.accounts.mint.to_account_info())?;

    require_gt!(ctx.accounts.mint.supply, 0, ErrorCode::ZeroSupply);

    let decimals = ctx.accounts.mint.decimals;
    require!(
        matches!(decimals, 6 | 8 | 9 | 10),
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

    // deterministic numeric pool id
    let pool_id = {
        let mut hasher = sha2::Sha256::new();
        hasher.update(salt);
        hasher.update(clock.slot.to_le_bytes());
        hasher.update(ctx.accounts.user.key().as_ref());
        let hash = hasher.finalize();
        u64::from_le_bytes(hash[..8].try_into().unwrap())
    };

    /* =======================
        STATE INITIALIZATION
       ======================= */

    pool.pool_id = pool_id;
    pool.pool_token = ctx.accounts.pool_token.key(); // ✅ CRITICAL FIX
    pool.salt = salt;
    pool.mint = ctx.accounts.mint.key();
    pool.creator = ctx.accounts.user.key();
    pool.start_time = clock.unix_timestamp;
    pool.duration = POOL_OPEN_DURATION;
    pool.expire_time = clock.unix_timestamp + POOL_OPEN_DURATION;
    pool.end_time = 0;
    pool.unlock_time = 0;
    pool.close_time = 0;
    pool.max_participants = max_participants;
    pool.lock_duration = lock_duration;
    pool.lock_start_time = 0;
    pool.amount = amount;
    pool.total_amount = amount;
    pool.total_volume = amount;
    pool.total_joins = 1;
    pool.total_donations = 0;
    pool.dev_wallet = dev_wallet;
    pool.dev_fee_bps = dev_fee_bps;
    pool.burn_fee_bps = burn_fee_bps;
    pool.treasury_wallet = treasury_wallet;
    pool.treasury_fee_bps = treasury_fee_bps;
    pool.randomness = 0;
    pool.randomness_account = ZERO_PUBKEY;
    pool.randomness_deadline_slot = 0;
    pool.bump = ctx.bumps.pool;
    pool.status = PoolStatus::Open;
    pool.status_reason = 0;
    pool.paused = false;
    pool.version = 1;
    pool.schema = 1;
    // 🔒 SECURITY: On mainnet, ALWAYS disable mock mode to prevent manipulation
    #[cfg(feature = "mainnet")]
    let allow_mock = false;
    pool.allow_mock = allow_mock;
    pool.randomness_commit_slot = 0;
    pool.last_join_time = clock.unix_timestamp;
    pool.winner = ZERO_PUBKEY;
    pool.processing = false; // 🔒 Initialize reentrancy guard

    // config hash (anti-tamper)
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
    hasher.update(pool.start_time.to_le_bytes());
    hasher.update(pool.duration.to_le_bytes());
    pool.config_hash = hasher.finalize().into();

    /* =======================
        USER TOKEN CHECK
       ======================= */

    let expected_ata = associated_token::get_associated_token_address_with_program_id(
        &ctx.accounts.user.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.token_program.key(),
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

    // initial bet transfer
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

    // participants init
    ctx.accounts.participants.list[0] = ctx.accounts.user.key();
    ctx.accounts.participants.count = 1;
    pool.participants_account = ctx.accounts.participants.key();

    emit!(PoolStateEvent {
        pool_id: pool.key(),
        numerical_pool_id: pool_id,
        status: PoolStatus::Open,
        participant_count: 1,
        total_amount: amount,
        status_reason: 0,
    });

    emit!(PoolActivityEvent {
        pool_id: pool.key(),
        numerical_pool_id: pool_id,
        action: ActionType::Created,
        amount,
        participant_rank: 1,
        dev_fee_percent: dev_fee_bps,
        burn_fee_percent: burn_fee_bps,
        treasury_fee_percent: treasury_fee_bps,
    });

    pool.initialized = true;

    Ok(())
}
