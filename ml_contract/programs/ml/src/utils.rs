use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

// ✅ IMPORTANT: use Anchor's re-export of spl_token_2022 to avoid version/type mismatch
use anchor_spl::token_2022::spl_token_2022 as spl_token_2022;

use spl_token_2022::{
    extension::{
        BaseStateWithExtensions,
        StateWithExtensions,
        transfer_fee::TransferFeeConfig,
        transfer_hook::TransferHook,
        confidential_transfer::ConfidentialTransferMint,
        non_transferable::NonTransferable,
        interest_bearing_mint::InterestBearingConfig,
        permanent_delegate::PermanentDelegate,
        mint_close_authority::MintCloseAuthority,
        default_account_state::DefaultAccountState,
    },
    state::{Mint as Token2022Mint, AccountState},
};

use crate::errors::ErrorCode;

/// ✅ SPL Classic + Token-2022 compatible token account validation
pub fn validate_token_account(
    token_account: &TokenAccount,
    expected_mint: &Pubkey,
    expected_owner: &Pubkey,
    strict: bool,
) -> Result<()> {
    require_eq!(token_account.mint, *expected_mint, ErrorCode::InvalidMint);
    require_eq!(token_account.owner, *expected_owner, ErrorCode::InvalidParticipantToken);

    // ✅ No version mismatch: TokenAccount.state uses this AccountState type
    require!(token_account.state != AccountState::Frozen, ErrorCode::FrozenAccount);

    if strict {
        require!(token_account.delegate.is_none(), ErrorCode::HasDelegate);
        require!(token_account.close_authority.is_none(), ErrorCode::HasCloseAuthority);
    }

    Ok(())
}

/// ✅ Validate Token-2022 mint extensions to prevent dangerous features.
pub fn validate_token2022_mint(mint_account: &AccountInfo) -> Result<()> {
    // If mint isn't owned by Token-2022 program => classic SPL, no extensions
    if mint_account.owner != &spl_token_2022::ID {
        return Ok(());
    }

    let mint_data = mint_account.try_borrow_data()?;
    let mint = StateWithExtensions::<Token2022Mint>::unpack(&mint_data)?;

    // 🔴 TransferFee modifies received amount
    if mint.get_extension::<TransferFeeConfig>().is_ok() {
        msg!("❌ REJECTED: Mint has TransferFee extension");
        return Err(ErrorCode::ForbiddenTransferFee.into());
    }

    // 🔴 TransferHook executes arbitrary code on transfer
    if mint.get_extension::<TransferHook>().is_ok() {
        msg!("❌ REJECTED: Mint has TransferHook extension");
        return Err(ErrorCode::ForbiddenTransferHook.into());
    }

    // 🔴 ConfidentialTransfer hides balances
    if mint.get_extension::<ConfidentialTransferMint>().is_ok() {
        msg!("❌ REJECTED: Mint has ConfidentialTransfer extension");
        return Err(ErrorCode::ForbiddenConfidentialTransfer.into());
    }

    // 🔴 NonTransferable disables transfers
    if mint.get_extension::<NonTransferable>().is_ok() {
        msg!("❌ REJECTED: Mint has NonTransferable extension");
        return Err(ErrorCode::ForbiddenNonTransferable.into());
    }

    // 🟠 InterestBearing changes balances over time
    if mint.get_extension::<InterestBearingConfig>().is_ok() {
        msg!("❌ REJECTED: Mint has InterestBearing extension");
        return Err(ErrorCode::ForbiddenInterestBearing.into());
    }

    // 🟠 PermanentDelegate is a control risk
    if mint.get_extension::<PermanentDelegate>().is_ok() {
        msg!("❌ REJECTED: Mint has PermanentDelegate extension");
        return Err(ErrorCode::ForbiddenPermanentDelegate.into());
    }

    // 🟡 MintCloseAuthority must be disabled
    if let Ok(ext) = mint.get_extension::<MintCloseAuthority>() {
        if Option::<Pubkey>::from(ext.close_authority).is_some() {
            msg!("❌ REJECTED: Mint has active MintCloseAuthority");
            return Err(ErrorCode::ForbiddenMintCloseAuthority.into());
        }
    }

    // 🟡 DefaultAccountState must be Initialized
    if let Ok(ext) = mint.get_extension::<DefaultAccountState>() {
        if ext.state != AccountState::Initialized as u8 {
            msg!("❌ REJECTED: Mint has DefaultAccountState != Initialized");
            return Err(ErrorCode::ForbiddenDefaultAccountState.into());
        }
    }

    msg!("✅ ACCEPTED: Token-2022 mint passed extension checks");
    Ok(())
}
