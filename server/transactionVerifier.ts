import { Connection, PublicKey } from "@solana/web3.js";
import { logger, logError } from "./logger";
import { rpcManager, withRPCFailover } from "./rpc-manager";

const PROGRAM_ID = new PublicKey("53oTPbfy559uTaJQAbuWeAN1TyWXK1KfxUsM2GPJtrJw");

// Instruction discriminators (first 8 bytes of instruction data)
// Calculated as sha256("global:{function_name}")[0..8]
const INSTRUCTION_DISCRIMINATORS = {
  CLAIM_REFUND: [15, 16, 30, 161, 255, 228, 97, 60],
  CLAIM_RENT: [57, 233, 51, 137, 102, 101, 26, 101],
  CANCEL_POOL: [211, 11, 27, 100, 252, 115, 57, 77],
  DONATE: [121, 186, 218, 211, 73, 70, 196, 180],
};

// Get connection from RPC manager with failover support
function getConnection(): Connection {
  return rpcManager.getConnection();
}

/**
 * Verify that a transaction exists on-chain and succeeded
 * Returns transaction data if valid, throws error otherwise
 */
export async function verifyTransactionExists(txHash: string): Promise<{
  exists: boolean;
  succeeded: boolean;
  blockTime: number | null;
}> {
  const conn = getConnection();

  try {
    logger.info(`[TX_VERIFY] Checking transaction: ${txHash.slice(0, 16)}...`);

    const tx = await conn.getTransaction(txHash, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!tx) {
      logger.warn(`[TX_VERIFY] Transaction not found: ${txHash.slice(0, 16)}...`);
      return {
        exists: false,
        succeeded: false,
        blockTime: null,
      };
    }

    const succeeded = tx.meta?.err === null;

    logger.info(`[TX_VERIFY] Transaction found: ${txHash.slice(0, 16)}... succeeded=${succeeded}`);

    return {
      exists: true,
      succeeded,
      blockTime: tx.blockTime,
    };
  } catch (err: any) {
    logError(err, `[TX_VERIFY] Error checking transaction ${txHash.slice(0, 16)}`);
    throw new Error(`Failed to verify transaction: ${err.message}`);
  }
}

/**
 * Verify that a pool account exists on-chain
 * Returns true if account exists and is owned by the program
 */
export async function verifyPoolExists(
  poolAddress: string,
  expectedProgramId: string = "53oTPbfy559uTaJQAbuWeAN1TyWXK1KfxUsM2GPJtrJw"
): Promise<{
  exists: boolean;
  ownedByProgram: boolean;
  accountData: any;
}> {
  const conn = getConnection();

  try {
    logger.info(`[POOL_VERIFY] Checking pool account: ${poolAddress.slice(0, 16)}...`);

    const poolPubkey = new PublicKey(poolAddress);
    const accountInfo = await conn.getAccountInfo(poolPubkey, "confirmed");

    if (!accountInfo) {
      logger.warn(`[POOL_VERIFY] Pool account not found: ${poolAddress.slice(0, 16)}...`);
      return {
        exists: false,
        ownedByProgram: false,
        accountData: null,
      };
    }

    const programId = new PublicKey(expectedProgramId);
    const ownedByProgram = accountInfo.owner.equals(programId);

    logger.info(
      `[POOL_VERIFY] Pool found: ${poolAddress.slice(0, 16)}... ownedByProgram=${ownedByProgram}`
    );

    return {
      exists: true,
      ownedByProgram,
      accountData: accountInfo,
    };
  } catch (err: any) {
    logError(err, `[POOL_VERIFY] Error checking pool ${poolAddress.slice(0, 16)}`);
    throw new Error(`Failed to verify pool: ${err.message}`);
  }
}

/**
 * Verify that a transaction created a specific pool account
 * Checks that:
 * 1. Transaction exists and succeeded
 * 2. Pool account exists
 * 3. Pool account is owned by the program
 * 4. Transaction was created recently (within last 5 minutes to prevent replay attacks)
 */
export async function verifyPoolCreationTransaction(
  txHash: string,
  poolAddress: string,
  expectedCreator: string
): Promise<{
  valid: boolean;
  reason?: string;
}> {
  try {
    logger.info(
      `[POOL_CREATE_VERIFY] Verifying pool creation: tx=${txHash.slice(0, 16)}... pool=${poolAddress.slice(0, 16)}...`
    );

    // Step 1: Verify transaction exists and succeeded
    const txVerification = await verifyTransactionExists(txHash);

    if (!txVerification.exists) {
      return {
        valid: false,
        reason: "Transaction not found on-chain. Please wait a few seconds and try again.",
      };
    }

    if (!txVerification.succeeded) {
      return {
        valid: false,
        reason: "Transaction failed on-chain. Please check your wallet and try again.",
      };
    }

    // Step 2: Check transaction age (prevent replay attacks)
    // Transaction must be recent (within last 5 minutes)
    if (txVerification.blockTime) {
      const now = Math.floor(Date.now() / 1000);
      const txAge = now - txVerification.blockTime;

      if (txAge > 300) {
        // 5 minutes
        logger.warn(
          `[POOL_CREATE_VERIFY] Transaction too old: ${txAge}s, tx=${txHash.slice(0, 16)}...`
        );
        return {
          valid: false,
          reason: "Transaction is too old. Please create a new pool.",
        };
      }
    }

    // Step 3: Verify pool account exists on-chain
    const poolVerification = await verifyPoolExists(poolAddress);

    if (!poolVerification.exists) {
      return {
        valid: false,
        reason: "Pool account not found on-chain. Transaction may not have created the pool.",
      };
    }

    if (!poolVerification.ownedByProgram) {
      return {
        valid: false,
        reason: "Pool account is not owned by the lottery program. Invalid pool.",
      };
    }

    logger.info(
      `[POOL_CREATE_VERIFY] ✅ Valid pool creation: tx=${txHash.slice(0, 16)}... pool=${poolAddress.slice(0, 16)}...`
    );

    return {
      valid: true,
    };
  } catch (err: any) {
    logError(err, `[POOL_CREATE_VERIFY] Error verifying pool creation`);
    return {
      valid: false,
      reason: `Verification error: ${err.message}`,
    };
  }
}

/**
 * Verify that a join pool transaction is valid
 * Checks that:
 * 1. Transaction exists and succeeded
 * 2. Transaction is recent (within last 2 minutes)
 */
export async function verifyJoinTransaction(
  txHash: string,
  poolAddress: string,
  walletAddress: string
): Promise<{
  valid: boolean;
  reason?: string;
}> {
  try {
    logger.info(
      `[JOIN_VERIFY] Verifying join: tx=${txHash.slice(0, 16)}... pool=${poolAddress.slice(0, 16)}... wallet=${walletAddress.slice(0, 16)}...`
    );

    // Step 1: Verify transaction exists and succeeded
    const txVerification = await verifyTransactionExists(txHash);

    if (!txVerification.exists) {
      return {
        valid: false,
        reason: "Transaction not found on-chain. Please wait a few seconds and try again.",
      };
    }

    if (!txVerification.succeeded) {
      return {
        valid: false,
        reason: "Transaction failed on-chain. Please check your wallet and try again.",
      };
    }

    // Step 2: Check transaction age (must be recent to prevent replay)
    if (txVerification.blockTime) {
      const now = Math.floor(Date.now() / 1000);
      const txAge = now - txVerification.blockTime;

      if (txAge > 120) {
        // 2 minutes
        logger.warn(`[JOIN_VERIFY] Transaction too old: ${txAge}s, tx=${txHash.slice(0, 16)}...`);
        return {
          valid: false,
          reason: "Transaction is too old. Please try joining again.",
        };
      }
    }

    logger.info(`[JOIN_VERIFY] ✅ Valid join transaction: tx=${txHash.slice(0, 16)}...`);

    return {
      valid: true,
    };
  } catch (err: any) {
    logError(err, `[JOIN_VERIFY] Error verifying join transaction`);
    return {
      valid: false,
      reason: `Verification error: ${err.message}`,
    };
  }
}

/**
 * GENERIC USER TRANSACTION VERIFIER
 * Verifies that a transaction:
 * - Exists on-chain and succeeded
 * - Was signed by the expected wallet (accountKeys[0])
 * - Called the lottery program
 * - Used the expected instruction discriminator
 * - Targeted the expected pool PDA
 */
export async function verifyUserTransaction(
  txHash: string,
  expectedWallet: string,
  expectedInstruction: keyof typeof INSTRUCTION_DISCRIMINATORS,
  poolAddress: string
): Promise<{
  valid: boolean;
  reason?: string;
}> {
  const conn = getConnection();

  try {
    const logPrefix = `[${expectedInstruction}_VERIFY]`;
    logger.info(
      `${logPrefix} Verifying: tx=${txHash.slice(0, 16)}... wallet=${expectedWallet.slice(0, 16)}... pool=${poolAddress.slice(0, 16)}...`
    );

    // Step 1: Fetch transaction
    const tx = await conn.getTransaction(txHash, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!tx) {
      logger.warn(`${logPrefix} Transaction not found: ${txHash.slice(0, 16)}...`);
      return {
        valid: false,
        reason: "Transaction not found on-chain. Please wait a few seconds and try again.",
      };
    }

    // Step 2: Check transaction succeeded
    if (tx.meta?.err) {
      logger.warn(`${logPrefix} Transaction failed: ${txHash.slice(0, 16)}... error=${JSON.stringify(tx.meta.err)}`);
      return {
        valid: false,
        reason: "Transaction failed on-chain. Please check your wallet and try again.",
      };
    }

    // Step 3: Verify signer (first account must be the user wallet)
    const accountKeys = tx.transaction.message.getAccountKeys();
    const signerPubkey = accountKeys.get(0);

    if (!signerPubkey || signerPubkey.toBase58() !== expectedWallet) {
      logger.warn(
        `${logPrefix} Signer mismatch: expected=${expectedWallet.slice(0, 16)}... got=${signerPubkey?.toBase58().slice(0, 16) || "NONE"}`
      );
      return {
        valid: false,
        reason: "Transaction signer does not match your wallet.",
      };
    }

    // Step 4: Verify transaction age (prevent replay attacks - 5 minutes)
    if (tx.blockTime) {
      const now = Math.floor(Date.now() / 1000);
      const txAge = now - tx.blockTime;

      if (txAge > 300) {
        logger.warn(`${logPrefix} Transaction too old: ${txAge}s, tx=${txHash.slice(0, 16)}...`);
        return {
          valid: false,
          reason: "Transaction is too old. Please submit a new transaction.",
        };
      }
    }

    // Step 5: Verify program instruction exists and matches expected discriminator
    const instructions = tx.transaction.message.compiledInstructions;
    const expectedDiscriminator = INSTRUCTION_DISCRIMINATORS[expectedInstruction];

    let foundValidInstruction = false;

    for (const ix of instructions) {
      const programIdIndex = ix.programIdIndex;
      const programId = accountKeys.get(programIdIndex);

      // Check if this instruction is from our program
      if (programId && programId.equals(PROGRAM_ID)) {
        const instructionData = Buffer.from(ix.data);

        // Check if discriminator matches (first 8 bytes)
        if (instructionData.length >= 8) {
          const discriminator = Array.from(instructionData.slice(0, 8));
          const matches = discriminator.every((byte, idx) => byte === expectedDiscriminator[idx]);

          if (matches) {
            foundValidInstruction = true;
            logger.info(
              `${logPrefix} Found valid instruction: discriminator=${discriminator.join(",")}`
            );
            break;
          }
        }
      }
    }

    if (!foundValidInstruction) {
      logger.warn(
        `${logPrefix} No matching program instruction found: expected=${expectedInstruction}`
      );
      return {
        valid: false,
        reason: `Transaction does not contain valid ${expectedInstruction.toLowerCase().replace("_", " ")} instruction.`,
      };
    }

    // Step 6: Verify pool PDA is in transaction accounts
    const expectedPoolPubkey = new PublicKey(poolAddress);
    const poolAccountFound = accountKeys.staticAccountKeys.some((key) =>
      key.equals(expectedPoolPubkey)
    );

    if (!poolAccountFound) {
      logger.warn(
        `${logPrefix} Pool PDA not found in transaction: expected=${poolAddress.slice(0, 16)}...`
      );
      return {
        valid: false,
        reason: "Transaction does not target the correct pool.",
      };
    }

    logger.info(
      `${logPrefix} ✅ Verification successful: tx=${txHash.slice(0, 16)}... wallet=${expectedWallet.slice(0, 16)}...`
    );

    return {
      valid: true,
    };
  } catch (err: any) {
    logError(err, `[${expectedInstruction}_VERIFY] Error verifying transaction`);
    return {
      valid: false,
      reason: `Verification error: ${err.message}`,
    };
  }
}

/**
 * Verify claim_refund transaction
 */
export async function verifyClaimRefundTransaction(
  txHash: string,
  walletAddress: string,
  poolAddress: string
): Promise<{
  valid: boolean;
  reason?: string;
}> {
  return verifyUserTransaction(txHash, walletAddress, "CLAIM_REFUND", poolAddress);
}

/**
 * Verify claim_rent transaction
 */
export async function verifyClaimRentTransaction(
  txHash: string,
  walletAddress: string,
  poolAddress: string
): Promise<{
  valid: boolean;
  reason?: string;
}> {
  return verifyUserTransaction(txHash, walletAddress, "CLAIM_RENT", poolAddress);
}

/**
 * Verify cancel_pool transaction
 */
export async function verifyCancelPoolTransaction(
  txHash: string,
  walletAddress: string,
  poolAddress: string
): Promise<{
  valid: boolean;
  reason?: string;
}> {
  return verifyUserTransaction(txHash, walletAddress, "CANCEL_POOL", poolAddress);
}

/**
 * Verify donate transaction
 */
export async function verifyDonateTransaction(
  txHash: string,
  walletAddress: string,
  poolAddress: string
): Promise<{
  valid: boolean;
  reason?: string;
}> {
  return verifyUserTransaction(txHash, walletAddress, "DONATE", poolAddress);
}
