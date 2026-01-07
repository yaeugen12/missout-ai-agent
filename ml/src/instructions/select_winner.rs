use anchor_lang::prelude::*;
use sha2::Digest;
use switchboard_on_demand::RandomnessAccountData;

use crate::{
    constants::*,
    errors::ErrorCode,
    events::*,
    state::{ActionType, Participants, PoolStatus},
};

#[derive(Accounts)]
pub struct SelectWinner<'info> {
    #[account(mut)]
    pub pool: Account<'info, crate::state::Pool>,

    /// CHECK: Switchboard randomness account
    pub randomness: UncheckedAccount<'info>,

    pub user: Signer<'info>,

    #[account(
        seeds = [b"participants", pool.key().as_ref()],
        bump,
        constraint = participants.key() == pool.participants_account @ ErrorCode::InvalidParticipantsPda
    )]
    pub participants: Account<'info, Participants>,
}

pub fn select_winner(ctx: Context<SelectWinner>) -> Result<()> {
    let now = Clock::get()?;
    let now_ts = now.unix_timestamp;

    ctx.accounts.pool.assert_not_paused()?;
    require!(ctx.accounts.pool.status != PoolStatus::Ended, ErrorCode::AlreadyEnded);
    require!(
        ctx.accounts.pool.status != PoolStatus::Ended
            && ctx.accounts.pool.status != PoolStatus::Cancelled
            && ctx.accounts.pool.status != PoolStatus::Closed,
        ErrorCode::AlreadyEnded
    );

    if ctx.accounts.pool.randomness_commit_slot != 0 {
        require!(
            now.slot <= ctx.accounts.pool.randomness_commit_slot + 3000,
            ErrorCode::RandomnessExpired
        );
    }

    let is_timeout = now_ts > ctx.accounts.pool.unlock_time + PAYOUT_TIMEOUT;
    if !is_timeout {
        require_keys_eq!(ctx.accounts.user.key(), ctx.accounts.pool.dev_wallet, ErrorCode::Unauthorized);
    }

    require!(
        matches!(
            ctx.accounts.pool.status,
            PoolStatus::Unlocked | PoolStatus::RandomnessCommitted | PoolStatus::RandomnessRevealed
        ),
        ErrorCode::InvalidPoolStatus
    );

    let participant_count = ctx.accounts.participants.count as u64;
    require!(participant_count > 0, ErrorCode::NoParticipants);

    let pool_id = ctx.accounts.pool.pool_id;

    // config hash check
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

    let (randomness_u128, normalized): (u128, u64) =
        if ctx.accounts.pool.allow_mock && ctx.accounts.pool.randomness_account == Pubkey::default() {
            let mock_u128 = ctx.accounts.pool.randomness;
            require!(mock_u128 != 0, ErrorCode::RandomnessNotCommitted);

            let normalized = {
                let mut hasher = sha2::Sha256::new();
                hasher.update(pool_id.to_le_bytes());
                hasher.update(&mock_u128.to_le_bytes());
                let hash = hasher.finalize();
                u64::from_le_bytes(hash[0..8].try_into().unwrap())
            };

            ctx.accounts.pool.status = PoolStatus::RandomnessRevealed;
            (mock_u128, normalized)
        } else {
            if !ctx.accounts.pool.allow_mock {
                require_keys_eq!(
                    ctx.accounts.randomness.owner.key(),
                    SWITCHBOARD_ID,
                    ErrorCode::InvalidRandomnessAccount
                );
                require_keys_eq!(
                    ctx.accounts.randomness.key(),
                    ctx.accounts.pool.randomness_account,
                    ErrorCode::InvalidRandomnessAccount
                );
            }

            let randomness_data = RandomnessAccountData::parse(ctx.accounts.randomness.data.borrow())
                .map_err(|_| ErrorCode::InvalidRandomness)?;

            if !ctx.accounts.pool.allow_mock {
                require!(randomness_data.seed_slot != 0, ErrorCode::RandomnessNotCommitted);
            }

            let mut is_emergency = false;
            let randomness_u128: u128;
            let normalized: u64;

            if randomness_data.reveal_slot == 0 {
                require!(ctx.accounts.pool.allow_mock, ErrorCode::InvalidRandomness);
                require!(
                    now.unix_timestamp > ctx.accounts.pool.unlock_time + EMERGENCY_DELAY,
                    ErrorCode::TooEarlyForEmergency
                );

                let caller = ctx.accounts.user.key();
                let allowed = caller == ctx.accounts.pool.dev_wallet || caller == ctx.accounts.pool.creator;
                require!(allowed, ErrorCode::Unauthorized);

                let mock_randomness = {
                    let mut hasher = sha2::Sha256::new();
                    hasher.update(ctx.accounts.pool.pool_id.to_le_bytes());
                    hasher.update(now.slot.to_le_bytes());
                    hasher.update(ctx.accounts.pool.creator.as_ref());
                    let hash = hasher.finalize();
                    let mut bytes = [0u8; 16];
                    bytes.copy_from_slice(&hash[..16]);
                    u128::from_le_bytes(bytes)
                };

                randomness_u128 = mock_randomness;

                normalized = {
                    let mut hasher = sha2::Sha256::new();
                    hasher.update(pool_id.to_le_bytes());
                    hasher.update(&mock_randomness.to_le_bytes());
                    let hash = hasher.finalize();
                    u64::from_le_bytes(hash[0..8].try_into().unwrap())
                };

                ctx.accounts.pool.randomness_account = ZERO_PUBKEY;
                is_emergency = true;
            } else {
                if !ctx.accounts.pool.allow_mock {
                    require!(
                        !randomness_data.value.iter().all(|&x| x == 0),
                        ErrorCode::RandomnessNotResolved
                    );
                }
                require!(randomness_data.value != [0u8; 32], ErrorCode::RandomnessNotResolved);

                randomness_u128 = u128::from_le_bytes(randomness_data.value[0..16].try_into().unwrap());

                normalized = {
                    let mut hasher = sha2::Sha256::new();
                    hasher.update(pool_id.to_le_bytes());
                    hasher.update(&randomness_data.value[0..16]);
                    let hash = hasher.finalize();
                    u64::from_le_bytes(hash[0..8].try_into().unwrap())
                };
            }

            ctx.accounts.pool.status = PoolStatus::RandomnessRevealed;

            if is_emergency {
                emit!(PoolActivityEvent {
                    pool_id: ctx.accounts.pool.key(),
                    numerical_pool_id: pool_id,
                    action: ActionType::EmergencyReveal,
                    amount: 0,
                    participant_rank: 0,
                    dev_fee_percent: ctx.accounts.pool.dev_fee_bps,
                    burn_fee_percent: ctx.accounts.pool.burn_fee_bps,
                    treasury_fee_percent: ctx.accounts.pool.treasury_fee_bps,
                });
            }

            (randomness_u128, normalized)
        };

    let winner_index = (normalized % participant_count) as usize;
    require!(
        winner_index < ctx.accounts.participants.count as usize,
        ErrorCode::InvalidWinnerAccount
    );

    let winner_pubkey = ctx.accounts.participants.list[winner_index];

    ctx.accounts.pool.winner = winner_pubkey;
    ctx.accounts.pool.randomness = randomness_u128;
    ctx.accounts.pool.status = PoolStatus::WinnerSelected;
    ctx.accounts.pool.status_reason = 0;

    let participants_count_u8 = ctx.accounts.participants.count;

    emit!(PoolStateEvent {
        pool_id: ctx.accounts.pool.key(),
        numerical_pool_id: pool_id,
        status: PoolStatus::WinnerSelected,
        participant_count: participants_count_u8,
        total_amount: ctx.accounts.pool.total_amount,
        status_reason: 0,
    });

    Ok(())
}
