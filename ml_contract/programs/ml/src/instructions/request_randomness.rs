use anchor_lang::prelude::*;
use anchor_lang::system_program;
use sha2::Digest;
use switchboard_on_demand::RandomnessAccountData;

use crate::{
    constants::*,
    errors::ErrorCode,
    events::*,
    state::{ActionType, Participants, PoolStatus},
};

#[derive(Accounts)]
pub struct RequestRandomness<'info> {
    /// CHECK: Switchboard randomness account.
    pub randomness: UncheckedAccount<'info>,

    #[account(mut)]
    pub pool: Account<'info, crate::state::Pool>,

    pub user: Signer<'info>,

    #[account(
        seeds = [b"participants", pool.key().as_ref()],
        bump,
        constraint = participants.key() == pool.participants_account @ ErrorCode::InvalidParticipantsPda
    )]
    pub participants: Account<'info, Participants>,
}

pub fn request_randomness(ctx: Context<RequestRandomness>) -> Result<()> {
    ctx.accounts.pool.assert_not_paused()?;
    require!(ctx.accounts.pool.status == PoolStatus::Unlocked, ErrorCode::InvalidPoolStatus);

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= ctx.accounts.pool.lock_start_time + ctx.accounts.pool.lock_duration,
        ErrorCode::PoolStillLocked
    );

    let now = clock.unix_timestamp;
    let caller = ctx.accounts.user.key();

    let allowed = if now > ctx.accounts.pool.unlock_time + PAYOUT_TIMEOUT {
        caller == ctx.accounts.pool.dev_wallet || caller == ctx.accounts.pool.creator
    } else {
        caller == ctx.accounts.pool.dev_wallet
    };
    require!(allowed, ErrorCode::Unauthorized);

    let rk = ctx.accounts.randomness.key();

    // mock if randomness is default OR System Program
    let is_mock = ctx.accounts.pool.allow_mock && (rk == Pubkey::default() || rk == system_program::ID);

    if is_mock {
        require!(ctx.accounts.pool.randomness_account == ZERO_PUBKEY, ErrorCode::RandomnessAlreadySet);
        require!(
            rk == Pubkey::default() || rk == system_program::ID,
            ErrorCode::InvalidRandomnessAccount
        );

        let mock_randomness = {
            let mut hasher = sha2::Sha256::new();
            hasher.update(ctx.accounts.pool.pool_id.to_le_bytes());
            hasher.update(clock.slot.to_le_bytes());
            hasher.update(ctx.accounts.pool.creator.as_ref());
            let hash = hasher.finalize();
            let mut bytes = [0u8; 16];
            bytes.copy_from_slice(&hash[..16]);
            u128::from_le_bytes(bytes)
        };

        ctx.accounts.pool.randomness = mock_randomness;
        ctx.accounts.pool.randomness_account = Pubkey::default();
        ctx.accounts.pool.status = PoolStatus::RandomnessCommitted;
    } else {
        require!(ctx.accounts.pool.randomness_account == ZERO_PUBKEY, ErrorCode::RandomnessAlreadySet);

        require_keys_eq!(
            ctx.accounts.randomness.owner.key(),
            SWITCHBOARD_ID,
            ErrorCode::InvalidRandomnessAccount
        );

        let randomness_data = RandomnessAccountData::parse(ctx.accounts.randomness.data.borrow())
            .map_err(|_| ErrorCode::InvalidRandomness)?;

        require!(
            randomness_data.seed_slot <= clock.slot && randomness_data.seed_slot >= clock.slot.saturating_sub(300),
            ErrorCode::InvalidRandomness
        );

        ctx.accounts.pool.randomness_account = rk;
        ctx.accounts.pool.status = PoolStatus::RandomnessCommitted;
    }

    ctx.accounts.pool.randomness_commit_slot = clock.slot;
    ctx.accounts.pool.randomness_deadline_slot = clock.slot + 3000;

    let participants_count = ctx.accounts.participants.count;

    emit!(PoolStateEvent {
        pool_id: ctx.accounts.pool.key(),
        numerical_pool_id: ctx.accounts.pool.pool_id,
        status: PoolStatus::RandomnessCommitted,
        participant_count: participants_count,
        total_amount: ctx.accounts.pool.total_amount,
        status_reason: 0,
    });

    emit!(PoolActivityEvent {
        pool_id: ctx.accounts.pool.key(),
        numerical_pool_id: ctx.accounts.pool.pool_id,
        action: if is_mock { ActionType::RandomnessMockCommitted } else { ActionType::RandomnessCommitted },
        amount: 0,
        participant_rank: 0,
        dev_fee_percent: ctx.accounts.pool.dev_fee_bps,
        burn_fee_percent: ctx.accounts.pool.burn_fee_bps,
        treasury_fee_percent: ctx.accounts.pool.treasury_fee_bps,
    });

    Ok(())
}
