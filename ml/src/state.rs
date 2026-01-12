use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::ErrorCode;

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub pool_id: u64,
    pub salt: [u8; 32],
    pub mint: Pubkey,
    pub pool_token: Pubkey,
    pub creator: Pubkey,
    pub start_time: i64,
    pub duration: i64,
    pub expire_time: i64,
    pub end_time: i64,
    pub unlock_time: i64,
    pub close_time: i64,
    pub max_participants: u8,
    pub lock_duration: i64,
    pub lock_start_time: i64,
    pub amount: u64,
    pub total_amount: u64,
    pub total_volume: u64,
    pub total_joins: u32,
    pub total_donations: u32,
    pub dev_wallet: Pubkey,
    pub dev_fee_bps: u16,
    pub burn_fee_bps: u16,
    pub treasury_wallet: Pubkey,
    pub treasury_fee_bps: u16,
    pub randomness: u128,
    pub randomness_account: Pubkey,
    pub randomness_deadline_slot: u64,
    pub bump: u8,
    pub status: PoolStatus,
    pub paused: bool,
    pub version: u8,
    pub schema: u8,
    pub config_hash: [u8; 32],
    pub allow_mock: bool,
    pub randomness_commit_slot: u64,
    pub initialized: bool,
    pub last_join_time: i64,
    pub status_reason: u8,
    pub participants_account: Pubkey,
    pub winner: Pubkey,
}

impl Pool {
    pub fn assert_open(&self) -> Result<()> {
        require!(self.status == PoolStatus::Open, ErrorCode::InvalidPoolStatus);
        Ok(())
    }

    pub fn assert_open_not_paused(&self) -> Result<()> {
        self.assert_not_paused()?;
        self.assert_open()?;
        Ok(())
    }

    pub fn assert_owner(&self, user: &Pubkey) -> Result<()> {
        require!(*user == self.creator, ErrorCode::NotCreator);
        Ok(())
    }

    pub fn is_expired(&self, now: i64) -> bool {
        now > self.start_time + self.duration
    }

    pub fn is_active(&self, now: i64) -> bool {
        self.status == PoolStatus::Open && !self.paused && !self.is_expired(now)
    }

    pub fn is_locked(&self, now: i64) -> bool {
        self.lock_start_time != 0 && now >= self.lock_start_time
    }

    pub fn can_join(&self, now: i64) -> bool {
        self.is_active(now) && !self.is_locked(now)
    }

    pub fn can_join_status(&self) -> bool {
        matches!(self.status, PoolStatus::Open)
    }

    pub fn can_donate(&self, now: i64) -> Result<()> {
        if self.status == PoolStatus::Open {
            self.assert_active_join_period(now)?;
        } else if self.status == PoolStatus::Locked {
            require!(
                now < self.lock_start_time + self.lock_duration,
                ErrorCode::DonateClosedAfterUnlock
            );
        } else {
            return err!(ErrorCode::DonateClosedAfterUnlock);
        }
        Ok(())
    }

    pub fn assert_not_paused(&self) -> Result<()> {
        require!(!self.paused, ErrorCode::Paused);
        Ok(())
    }

    pub fn assert_active_join_period(&self, now: i64) -> Result<()> {
        require!(now <= self.start_time + self.duration, ErrorCode::PoolExpired);
        Ok(())
    }

    pub fn assert_unlocked_time(&self, now: i64) -> Result<()> {
        require!(
            now >= self.lock_start_time + self.lock_duration,
            ErrorCode::PoolStillLocked
        );
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct Participants {
    pub list: [Pubkey; MAX_PARTICIPANTS],
    pub count: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
#[repr(u8)]
pub enum PoolStatus {
    Open = 0,
    Locked = 1,
    Unlocked = 2,
    RandomnessCommitted = 3,
    RandomnessRevealed = 4,
    WinnerSelected = 5,
    Ended = 6,
    Cancelled = 7,
    Closed = 8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
#[repr(u8)]
pub enum ActionType {
    Created = 0,
    Joined = 1,
    Donated = 2,
    Closed = 3,
    Ended = 5,
    Cancelled = 6,
    RandomnessCommitted = 8,
    RandomnessMockCommitted = 9,
    ReachedMax = 10,
    Unlocked = 11,
    AdminClosed = 12,
    EmergencyReveal = 13,
    Expired = 14,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
#[repr(u8)]
pub enum HintType {
    ReachedMax = 1,
    NearExpire = 3,
    Unlocked = 4,
}
