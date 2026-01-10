use anchor_lang::prelude::*;
use anchor_spl::token::{spl_token::state::AccountState, TokenAccount};
use crate::errors::ErrorCode;

pub fn validate_token_account(
    token_account: &TokenAccount,
    expected_mint: &Pubkey,
    expected_owner: &Pubkey,
    strict: bool,
) -> Result<()> {
    require_eq!(token_account.mint, *expected_mint, ErrorCode::InvalidMint);
    require_eq!(token_account.owner, *expected_owner, ErrorCode::InvalidParticipantToken);
    require!(token_account.state != AccountState::Frozen, ErrorCode::FrozenAccount);
    if strict {
        require!(token_account.delegate.is_none(), ErrorCode::HasDelegate);
        require!(token_account.close_authority.is_none(), ErrorCode::HasCloseAuthority);
    }
    Ok(())
}
