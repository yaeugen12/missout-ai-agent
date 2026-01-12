import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { v4 as uuidv4 } from "uuid";

import { getMissoutClient, PoolState, ParticipantsState } from "../client";
import { derivePoolPda, deriveParticipantsPda, derivePoolTokenAddress } from "../pda/derive";
import { TokenAmount } from "../utils/token";
import { PROGRAM_ID } from "../programs/program-id";
import { resolveTokenProgramForMint } from "../utils/token-program";

export interface CreatePoolParams {
  mint: PublicKey;
  amount: string;
  maxParticipants: number;
  lockDurationSeconds: number;
  devWallet: PublicKey;
  devFeeBps: number;
  burnFeeBps: number;
  treasuryWallet: PublicKey;
  treasuryFeeBps: number;
  allowMock?: boolean;
}

export interface JoinPoolParams {
  poolId: string;
  amount: string;
}

export interface DonateParams {
  poolId: string;
  amount: string;
}

function generateSalt(): Uint8Array {
  const uuid = uuidv4().replace(/-/g, "");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(uuid.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function createInstructionWithDiscriminator(
  discriminator: number[],
  data: Buffer,
  keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
): TransactionInstruction {
  const fullData = Buffer.concat([Buffer.from(discriminator), data]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data: fullData,
  });
}

export async function createPool(params: CreatePoolParams): Promise<{ poolId: string; tx: string }> {
  console.log("==============================================");
  console.log("=== SDK_CREATEPOOL_ENTER ===");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Params received:", {
    mint: params.mint.toBase58(),
    amount: params.amount,
    maxParticipants: params.maxParticipants,
    lockDurationSeconds: params.lockDurationSeconds,
    allowMock: params.allowMock,
  });

  const client = getMissoutClient();
  const conn = client.getConnection();
  const wallet = client.getWallet();

  console.log("SDK_WALLET_CHECK:", {
    hasWallet: !!wallet,
    hasPublicKey: !!wallet?.publicKey,
    publicKey: wallet?.publicKey?.toBase58() || "null",
    hasSignTransaction: typeof wallet?.signTransaction === 'function',
    connected: wallet?.connected,
  });

  if (!wallet?.publicKey) {
    console.error("SDK_ABORT: Wallet not connected (no publicKey)");
    throw new Error("Wallet not connected");
  }

  if (!wallet.signTransaction) {
    console.error("SDK_ABORT: Wallet cannot sign transactions (no signTransaction method)");
    throw new Error("Wallet cannot sign transactions");
  }

  console.log("SDK_WALLET_OK: Wallet ready to sign");

  console.log("==================================================");
  console.log("[SDK] createPool verification");
  console.log("RPC Endpoint:", conn.rpcEndpoint);
  const genesisHash = await conn.getGenesisHash();
  console.log("Genesis Hash:", genesisHash);
  if (genesisHash !== 'EtWTRABG3VvS7uLxsMHn5P6qvG8gX6XrAf9e6Wbn9JNE') {
    console.error("FAIL: Not on Devnet! Expected EtWTRABG3VvS7uLxsMHn5P6qvG8gX6XrAf9e6Wbn9JNE, got", genesisHash);
  }

  const salt = generateSalt();
  const [poolPda] = derivePoolPda(params.mint, salt);
  const [participantsPda] = deriveParticipantsPda(poolPda);

  const userPk = wallet.publicKey;
  const tokenProgramId = await resolveTokenProgramForMint(conn, params.mint);
  
  // Derive poolToken AFTER we have tokenProgramId
  const poolToken = getAssociatedTokenAddressSync(params.mint, poolPda, true, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);

  console.log("Derived PDA (Pool):", poolPda.toBase58());
  console.log("Derived PDA (Participants):", participantsPda.toBase58());
  console.log("Derived PDA (Pool Token Vault):", poolToken.toBase58());
  console.log("Token Program ID:", tokenProgramId.toBase58());

  // Robust detection for ATA
  const userToken = getAssociatedTokenAddressSync(params.mint, userPk, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);

  // Check if user's ATA exists
  console.log("[CREATE_POOL] Checking if user ATA exists:", userToken.toBase58());
  const userTokenAccount = await conn.getAccountInfo(userToken);

  const instructions: TransactionInstruction[] = [];

  if (!userTokenAccount) {
    console.log("[CREATE_POOL] User ATA does not exist, creating it first...");
    const createAtaIx = createAssociatedTokenAccountInstruction(
      userPk,
      userToken,
      userPk,
      params.mint,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    instructions.push(createAtaIx);
  } else {
    console.log("[CREATE_POOL] User ATA already exists");
  }

  // CRITICAL: Check if pool_token ATA exists, create it if not
  console.log("[CREATE_POOL] Checking if pool_token ATA exists:", poolToken.toBase58());
  const poolTokenAccount = await conn.getAccountInfo(poolToken);

  if (!poolTokenAccount) {
    console.log("[CREATE_POOL] Pool token ATA does not exist, creating it first...");
    const createPoolTokenAtaIx = createAssociatedTokenAccountInstruction(
      userPk,        // payer
      poolToken,     // ATA address
      poolPda,       // owner (the pool PDA)
      params.mint,   // mint
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    instructions.push(createPoolTokenAtaIx);
  } else {
    console.log("[CREATE_POOL] Pool token ATA already exists");
  }

  const tokenAmount = await TokenAmount.fromTokens(params.amount, params.mint, conn);

  // IDL args: salt [u8;32], max_participants u8, lock_duration i64, amount u64, 
  // dev_wallet pubkey, dev_fee_bps u16, burn_fee_bps u16, treasury_wallet pubkey, treasury_fee_bps u16, allow_mock bool
  // Total: 32 + 1 + 8 + 8 + 32 + 2 + 2 + 32 + 2 + 1 = 120 bytes
  const dataBuffer = Buffer.alloc(120);
  let offset = 0;

  Buffer.from(salt).copy(dataBuffer, offset); offset += 32;
  dataBuffer.writeUInt8(params.maxParticipants, offset); offset += 1; // u8, not u16!
  console.log("[DEBUG] lockDurationSeconds VALUE BEFORE WRITE:", params.lockDurationSeconds, "TYPE:", typeof params.lockDurationSeconds);
  dataBuffer.writeBigInt64LE(BigInt(params.lockDurationSeconds), offset); offset += 8;
  console.log("[DEBUG] lockDurationSeconds IN BUFFER:", dataBuffer.readBigInt64LE(offset - 8));
  const amountBytes = tokenAmount.toBN().toArrayLike(Buffer, 'le', 8); // u64 = 8 bytes, not 16!
  amountBytes.copy(dataBuffer, offset); offset += 8;
  Buffer.from(params.devWallet.toBytes()).copy(dataBuffer, offset); offset += 32;
  dataBuffer.writeUInt16LE(params.devFeeBps, offset); offset += 2;
  dataBuffer.writeUInt16LE(params.burnFeeBps, offset); offset += 2;
  Buffer.from(params.treasuryWallet.toBytes()).copy(dataBuffer, offset); offset += 32;
  dataBuffer.writeUInt16LE(params.treasuryFeeBps, offset); offset += 2;
  dataBuffer.writeUInt8(params.allowMock ? 1 : 0, offset);

  console.log("DATA_BUFFER_SIZE:", dataBuffer.length, "OFFSET_FINAL:", offset + 1);

  // IDL account order: mint, pool, user_token, user, pool_token, token_program, ata_program, system_program, rent, participants
  const ix = createInstructionWithDiscriminator(
    [233, 146, 209, 142, 207, 104, 64, 188],
    dataBuffer,
    [
      { pubkey: params.mint, isSigner: false, isWritable: true },        // 0: mint
      { pubkey: poolPda, isSigner: false, isWritable: true },            // 1: pool
      { pubkey: userToken, isSigner: false, isWritable: true },          // 2: user_token
      { pubkey: userPk, isSigner: true, isWritable: true },              // 3: user (signer)
      { pubkey: poolToken, isSigner: false, isWritable: true },          // 4: pool_token
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },  // 5: token_program
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 6: associated_token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },     // 7: system_program
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },          // 8: rent
      { pubkey: participantsPda, isSigner: false, isWritable: true },    // 9: participants
    ]
  );

  console.log("Instruction programId:", PROGRAM_ID.toBase58());
  console.log("Fee Payer:", userPk.toBase58());

  // Add create pool instruction to array
  instructions.push(ix);

  const sig = await client.buildAndSendTransaction(instructions);
  console.log("TX Signature:", sig);
  console.log(`Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);


  // ============================================================================
  // CRITICAL: ANCHOR-LEVEL POOL WARM-UP
  // ============================================================================
  // Wait for Anchor to successfully deserialize the Pool account.
  // This is the ONLY valid signal that donate/cancel/join can proceed.
  //
  // Do NOT return until this succeeds - otherwise frontend will show buttons
  // that will fail with AccountNotInitialized (3012).
  // ============================================================================
  console.log("[ANCHOR WARM-UP] Waiting for Anchor to deserialize pool...");
  const poolReady = await client.waitForAnchorPool(poolPda, 15, 1000);

  if (!poolReady) {
    console.error("[ANCHOR WARM-UP] ❌ TIMEOUT: Anchor cannot deserialize pool after 15 seconds");
    throw new Error("Pool creation succeeded but Anchor warm-up timed out. Pool may not be ready for interactions.");
  }

  console.log("[ANCHOR WARM-UP] ✅ Pool is ready - Anchor can deserialize successfully");
  console.log("==================================================");
  return {
    poolId: poolPda.toBase58(),
    tx: sig,
  };


















}

export async function joinPool(params: JoinPoolParams): Promise<{ tx: string }> {
  console.log("=== SDK_JOINPOOL_ENTER ===");
  const client = getMissoutClient();
  const conn = client.getConnection();
  const wallet = client.getWallet();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(params.poolId);

  // ============================================================================
  // PREVENTIVE ANCHOR READINESS CHECK
  // ============================================================================
  // Ensure Anchor can deserialize the pool BEFORE attempting to join.
  // This prevents AccountNotInitialized (3012) errors.
  // ============================================================================
  console.log("[JOIN] Checking if Anchor can deserialize pool...");
  const poolReady = await client.waitForAnchorPool(poolPk, 10, 1000);

  if (!poolReady) {
    throw new Error("Pool not ready: Anchor cannot deserialize pool account. Please wait and try again.");
  }
  console.log("[JOIN] ✅ Pool is Anchor-ready");

  const poolState = await client.getPoolState(params.poolId);

  if (!poolState) {
    throw new Error("Pool not found");
  }
  console.log("JOIN_POOL poolState.mint:", poolState.mint.toBase58());

  const [participantsPda] = deriveParticipantsPda(poolPk);

  const userPk = wallet.publicKey;
  const tokenProgramId = await resolveTokenProgramForMint(conn, poolState.mint);

  // CRITICAL: Use getAssociatedTokenAddressSync with correct tokenProgramId
  const poolToken = getAssociatedTokenAddressSync(poolState.mint, poolPk, true, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  const userToken = getAssociatedTokenAddressSync(poolState.mint, userPk, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);

  const tokenAmount = await TokenAmount.fromTokens(params.amount, poolState.mint, conn);

  // IDL: amount is u64 = 8 bytes
  const dataBuffer = Buffer.alloc(8);
  const amountBytes = tokenAmount.toBN().toArrayLike(Buffer, 'le', 8);
  amountBytes.copy(dataBuffer, 0);

  console.log("JOIN_POOL params:", { poolId: params.poolId, amount: params.amount, amountRaw: tokenAmount.toBN().toString() });

  // IDL account order: mint, pool, pool_token, user_token, user, token_program, participants
  const ix = createInstructionWithDiscriminator(
    [14, 65, 62, 16, 116, 17, 195, 107], // Correct discriminator from IDL
    dataBuffer,
    [
      { pubkey: poolState.mint, isSigner: false, isWritable: true },    // 0: mint
      { pubkey: poolPk, isSigner: false, isWritable: true },            // 1: pool
      { pubkey: poolToken, isSigner: false, isWritable: true },         // 2: pool_token
      { pubkey: userToken, isSigner: false, isWritable: true },         // 3: user_token
      { pubkey: userPk, isSigner: true, isWritable: true },             // 4: user (signer)
      { pubkey: tokenProgramId, isSigner: false, isWritable: false }, // 5: token_program
      { pubkey: participantsPda, isSigner: false, isWritable: true },   // 6: participants
    ]
  );

  const sig = await client.buildAndSendTransactionWithRetry([ix]);
  console.log("JOIN_POOL TX:", sig);

  return { tx: sig };
}

export async function donateToPool(params: DonateParams): Promise<{ tx: string }> {
  console.log("=== SDK_DONATE_ENTER ===");
  const client = getMissoutClient();
  const conn = client.getConnection();
  const wallet = client.getWallet();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(params.poolId);

  // ============================================================================
  // PREVENTIVE ANCHOR READINESS CHECK
  // ============================================================================
  // Ensure Anchor can deserialize the pool BEFORE attempting to donate.
  // This prevents AccountNotInitialized (3012) errors.
  // ============================================================================
  console.log("[DONATE] Checking if Anchor can deserialize pool...");
  const poolReady = await client.waitForAnchorPool(poolPk, 10, 1000);

  if (!poolReady) {
    throw new Error("Pool not ready: Anchor cannot deserialize pool account. Please wait and try again.");
  }
  console.log("[DONATE] ✅ Pool is Anchor-ready");

  const poolState = await client.getPoolState(params.poolId);

  if (!poolState) {
    throw new Error("Pool not found");
  }

  const [participantsPda] = deriveParticipantsPda(poolPk);

  const userPk = wallet.publicKey;
  const tokenProgramId = await resolveTokenProgramForMint(conn, poolState.mint);

  // CRITICAL: Use getAssociatedTokenAddressSync with correct tokenProgramId
  const poolToken = getAssociatedTokenAddressSync(poolState.mint, poolPk, true, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  const userToken = getAssociatedTokenAddressSync(poolState.mint, userPk, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);

  const tokenAmount = await TokenAmount.fromTokens(params.amount, poolState.mint, conn);

  // IDL: amount is u64 = 8 bytes
  const dataBuffer = Buffer.alloc(8);
  const amountBytes = tokenAmount.toBN().toArrayLike(Buffer, 'le', 8);
  amountBytes.copy(dataBuffer, 0);

  console.log("DONATE params:", { poolId: params.poolId, amount: params.amount, amountRaw: tokenAmount.toBN().toString() });

  // IDL account order: mint, pool, pool_token, user_token, user, token_program, participants
  const ix = createInstructionWithDiscriminator(
    [121, 186, 218, 211, 73, 70, 196, 180], // Correct discriminator from IDL
    dataBuffer,
    [
      { pubkey: poolState.mint, isSigner: false, isWritable: true },    // 0: mint
      { pubkey: poolPk, isSigner: false, isWritable: true },            // 1: pool
      { pubkey: poolToken, isSigner: false, isWritable: true },         // 2: pool_token
      { pubkey: userToken, isSigner: false, isWritable: true },         // 3: user_token
      { pubkey: userPk, isSigner: true, isWritable: true },             // 4: user (signer)
      { pubkey: tokenProgramId, isSigner: false, isWritable: false }, // 5: token_program
      { pubkey: participantsPda, isSigner: false, isWritable: true },   // 6: participants (try writable)
    ]
  );

  const sig = await client.buildAndSendTransactionWithRetry([ix]);
  console.log("DONATE TX:", sig);

  return { tx: sig };
}

export async function cancelPool(poolId: string): Promise<{ tx: string }> {
  const client = getMissoutClient();
  const wallet = client.getWallet();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(poolId);

  // ============================================================================
  // PREVENTIVE ANCHOR READINESS CHECK
  // ============================================================================
  // Ensure Anchor can deserialize the pool BEFORE attempting to cancel.
  // This prevents AccountNotInitialized (3012) errors.
  // ============================================================================
  console.log("[CANCEL] Checking if Anchor can deserialize pool...");
  const poolReady = await client.waitForAnchorPool(poolPk, 10, 1000);

  if (!poolReady) {
    throw new Error("Pool not ready: Anchor cannot deserialize pool account. Please wait and try again.");
  }
  console.log("[CANCEL] ✅ Pool is Anchor-ready");

  const poolState = await client.getPoolState(poolId);

  if (!poolState) {
    throw new Error("Pool not found");
  }

  const conn = client.getConnection();
  const tokenProgramId = await resolveTokenProgramForMint(conn, poolState.mint);

  const poolToken = getAssociatedTokenAddressSync(poolState.mint, poolPk, true, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  const userPk = wallet.publicKey;

  // Correct discriminator from IDL for cancel_pool: [211, 11, 27, 100, 252, 115, 57, 77]
  // IDL account order: mint, pool, pool_token, user, token_program, system_program
  const ix = createInstructionWithDiscriminator(
    [211, 11, 27, 100, 252, 115, 57, 77],
    Buffer.alloc(0),
    [
      { pubkey: poolState.mint, isSigner: false, isWritable: true },    // 0: mint
      { pubkey: poolPk, isSigner: false, isWritable: true },            // 1: pool
      { pubkey: poolToken, isSigner: false, isWritable: true },         // 2: pool_token
      { pubkey: userPk, isSigner: true, isWritable: true },             // 3: user (signer)
      { pubkey: tokenProgramId, isSigner: false, isWritable: false }, // 4: token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 5: system_program
    ]
  );

  const sig = await client.buildAndSendTransactionWithRetry([ix]);

  return { tx: sig };
}

export async function claimRefund(poolId: string): Promise<{ tx: string }> {
  const client = getMissoutClient();
  const wallet = client.getWallet();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(poolId);
  const poolState = await client.getPoolState(poolId);

  if (!poolState) {
    throw new Error("Pool not found");
  }

  const [participantsPda] = deriveParticipantsPda(poolPk);

  const userPk = wallet.publicKey;
  const conn = client.getConnection();
  const tokenProgramId = await resolveTokenProgramForMint(conn, poolState.mint);
  const poolToken = getAssociatedTokenAddressSync(poolState.mint, poolPk, true, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  const mintInfo = await conn.getAccountInfo(poolState.mint, "finalized");
  const userToken = getAssociatedTokenAddressSync(poolState.mint, userPk, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  const treasuryToken = getAssociatedTokenAddressSync(poolState.mint, poolState.treasuryWallet, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);

  // Claim Refund instruction - discriminator from IDL: [15, 16, 30, 161, 255, 228, 97, 60]
  // Account order from IDL: mint, pool, pool_token, user_token, treasury_token, user, token_program, participants
  const ix = createInstructionWithDiscriminator(
    [15, 16, 30, 161, 255, 228, 97, 60],
    Buffer.alloc(0),
    [
      { pubkey: poolState.mint, isSigner: false, isWritable: true },
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: poolToken, isSigner: false, isWritable: true },
      { pubkey: userToken, isSigner: false, isWritable: true },
      { pubkey: treasuryToken, isSigner: false, isWritable: true },
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ]
  );

  const sig = await client.buildAndSendTransaction([ix]);

  return { tx: sig };
}

export async function unlockPool(poolId: string): Promise<{ tx: string }> {
  const client = getMissoutClient();
  const wallet = client.getWallet();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(poolId);
  const [participantsPda] = deriveParticipantsPda(poolPk);

  const userPk = wallet.publicKey;

  const ix = createInstructionWithDiscriminator(
    [47, 28, 129, 176, 212, 153, 74, 200],
    Buffer.alloc(0),
    [
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ]
  );

  const sig = await client.buildAndSendTransaction([ix]);
  return { tx: sig };
}

export async function requestRandomness(poolId: string, randomnessAccount: PublicKey): Promise<{ tx: string }> {
  const client = getMissoutClient();
  const wallet = client.getWallet();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(poolId);
  const [participantsPda] = deriveParticipantsPda(poolPk);

  const userPk = wallet.publicKey;

  const ix = createInstructionWithDiscriminator(
    [213, 5, 173, 166, 22, 87, 32, 78],
    Buffer.alloc(0),
    [
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: randomnessAccount, isSigner: false, isWritable: false },
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ]
  );

  const sig = await client.buildAndSendTransaction([ix]);
  return { tx: sig };
}

export async function selectWinner(poolId: string, randomnessAccount: PublicKey): Promise<{ tx: string }> {
  const client = getMissoutClient();
  const wallet = client.getWallet();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(poolId);
  const [participantsPda] = deriveParticipantsPda(poolPk);

  const userPk = wallet.publicKey;

  const ix = createInstructionWithDiscriminator(
    [226, 191, 141, 219, 45, 106, 135, 243],
    Buffer.alloc(0),
    [
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: randomnessAccount, isSigner: false, isWritable: false },
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ]
  );

  const sig = await client.buildAndSendTransaction([ix]);
  return { tx: sig };
}

export async function payoutWinner(poolId: string): Promise<{ tx: string }> {
  const client = getMissoutClient();
  const wallet = client.getWallet();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(poolId);
  const poolState = await client.getPoolState(poolId);

  if (!poolState) {
    throw new Error("Pool not found");
  }

  const [participantsPda] = deriveParticipantsPda(poolPk);

  const userPk = wallet.publicKey;
  const conn = client.getConnection();
  const tokenProgramId = await resolveTokenProgramForMint(conn, poolState.mint);
  const poolToken = getAssociatedTokenAddressSync(poolState.mint, poolPk, true, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  const mintInfo = await conn.getAccountInfo(poolState.mint, "finalized");

  const winnerToken = getAssociatedTokenAddressSync(poolState.mint, poolState.winner, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  const devToken = getAssociatedTokenAddressSync(poolState.mint, poolState.devWallet, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  const treasuryToken = getAssociatedTokenAddressSync(poolState.mint, poolState.treasuryWallet, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);

  const ix = createInstructionWithDiscriminator(
    [183, 129, 85, 212, 25, 236, 138, 39],
    Buffer.alloc(0),
    [
      { pubkey: poolState.mint, isSigner: false, isWritable: false },
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: poolToken, isSigner: false, isWritable: true },
      { pubkey: winnerToken, isSigner: false, isWritable: true },
      { pubkey: devToken, isSigner: false, isWritable: true },
      { pubkey: treasuryToken, isSigner: false, isWritable: true },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
      { pubkey: poolState.winner, isSigner: false, isWritable: false },
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]
  );

  const sig = await client.buildAndSendTransaction([ix]);
  return { tx: sig };
}

export async function fetchPoolState(poolId: string): Promise<PoolState | null> {
  const client = getMissoutClient();
  return client.getPoolState(poolId);
}

export async function fetchParticipants(poolId: string): Promise<ParticipantsState | null> {
  const client = getMissoutClient();
  return client.getParticipantsState(poolId);
}

export function getPoolStatusString(status: any): string {
  const client = getMissoutClient();
  return client.getPoolStatus(status);
}

// ============================================================================
// NEW INSTRUCTIONS (8 total)
// ============================================================================

/**
 * Admin Close Pool - Allows admin to close a pool
 * Discriminator: [83, 105, 178, 188, 61, 125, 117, 200]
 */
export async function adminClosePool(poolId: string): Promise<{ tx: string }> {
  const client = getMissoutClient();
  const conn = client.getConnection();
  const wallet = client.getWallet();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(poolId);
  const poolState = await client.getPoolState(poolId);

  if (!poolState) {
    throw new Error("Pool not found");
  }


  const tokenProgramId = await resolveTokenProgramForMint(conn, poolState.mint);
  const poolToken = getAssociatedTokenAddressSync(poolState.mint, poolPk, true, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  const userPk = wallet.publicKey;

  const mintInfo = await conn.getAccountInfo(poolState.mint, "finalized");
  const creatorToken = getAssociatedTokenAddressSync(
    poolState.mint,
    poolState.creator,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // IDL account order: mint, pool, pool_token, creator_wallet, user (admin), token_program, system_program
  const ix = createInstructionWithDiscriminator(
    [83, 105, 178, 188, 61, 125, 117, 200],
    Buffer.alloc(0), // No args
    [
      { pubkey: poolState.mint, isSigner: false, isWritable: true },
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: poolToken, isSigner: false, isWritable: true },
      { pubkey: creatorToken, isSigner: false, isWritable: true },
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]
  );

  const sig = await client.buildAndSendTransaction([ix]);
  console.log("ADMIN_CLOSE_POOL TX:", sig);

  return { tx: sig };
}

/**
 * Pause Pool - Pauses pool operations
 * Discriminator: [160, 15, 12, 189, 160, 0, 243, 245]
 */
export async function pausePool(poolId: string): Promise<{ tx: string }> {
  const client = getMissoutClient();
  const wallet = client.getWallet();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(poolId);
  const [participantsPda] = deriveParticipantsPda(poolPk);
  const userPk = wallet.publicKey;

  // IDL account order: pool, user (signer), participants
  const ix = createInstructionWithDiscriminator(
    [160, 15, 12, 189, 160, 0, 243, 245],
    Buffer.alloc(0), // No args
    [
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ]
  );

  const sig = await client.buildAndSendTransaction([ix]);
  console.log("PAUSE_POOL TX:", sig);

  return { tx: sig };
}

/**
 * Unpause Pool - Resumes pool operations
 * Discriminator: [241, 148, 129, 243, 222, 125, 125, 160]
 */
export async function unpausePool(poolId: string): Promise<{ tx: string }> {
  const client = getMissoutClient();
  const wallet = client.getWallet();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(poolId);
  const [participantsPda] = deriveParticipantsPda(poolPk);
  const userPk = wallet.publicKey;

  // IDL account order: pool, user (signer), participants
  const ix = createInstructionWithDiscriminator(
    [241, 148, 129, 243, 222, 125, 125, 160],
    Buffer.alloc(0), // No args
    [
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ]
  );

  const sig = await client.buildAndSendTransaction([ix]);
  console.log("UNPAUSE_POOL TX:", sig);

  return { tx: sig };
}

/**
 * Force Expire - Forces a pool to expire
 * Discriminator: [181, 233, 225, 150, 213, 57, 145, 169]
 */
export async function forceExpire(poolId: string): Promise<{ tx: string }> {
  const client = getMissoutClient();
  const wallet = client.getWallet();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(poolId);
  const userPk = wallet.publicKey;

  // IDL account order: pool, user (signer)
  const ix = createInstructionWithDiscriminator(
    [181, 233, 225, 150, 213, 57, 145, 169],
    Buffer.alloc(0), // No args
    [
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: userPk, isSigner: true, isWritable: false },
    ]
  );

  const sig = await client.buildAndSendTransaction([ix]);
  console.log("FORCE_EXPIRE TX:", sig);

  return { tx: sig };
}

/**
 * Finalize Forfeited Pool - Finalizes a pool forfeited to treasury
 * Discriminator: [193, 214, 137, 120, 249, 9, 59, 161]
 */
export async function finalizeForfeitedPool(poolId: string): Promise<{ tx: string }> {
  const client = getMissoutClient();
  const conn = client.getConnection();
  const wallet = client.getWallet();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(poolId);
  const poolState = await client.getPoolState(poolId);

  if (!poolState) {
    throw new Error("Pool not found");
  }

  const [participantsPda] = deriveParticipantsPda(poolPk);

  const tokenProgramId = await resolveTokenProgramForMint(conn, poolState.mint);
  const poolToken = getAssociatedTokenAddressSync(poolState.mint, poolPk, true, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  const userPk = wallet.publicKey;

  const mintInfo = await conn.getAccountInfo(poolState.mint, "finalized");
  const treasuryToken = getAssociatedTokenAddressSync(
    poolState.mint,
    poolState.treasuryWallet,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // IDL account order: mint, pool, pool_token, treasury_token, user, token_program, participants
  const ix = createInstructionWithDiscriminator(
    [193, 214, 137, 120, 249, 9, 59, 161],
    Buffer.alloc(0), // No args
    [
      { pubkey: poolState.mint, isSigner: false, isWritable: true },
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: poolToken, isSigner: false, isWritable: true },
      { pubkey: treasuryToken, isSigner: false, isWritable: true },
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ]
  );

  const sig = await client.buildAndSendTransaction([ix]);
  console.log("FINALIZE_FORFEITED_POOL TX:", sig);

  return { tx: sig };
}

/**
 * Sweep Expired Pool - Cleans up an expired pool
 * Discriminator: [182, 4, 161, 221, 98, 188, 73, 145]
 */
export async function sweepExpiredPool(poolId: string): Promise<{ tx: string }> {
  const client = getMissoutClient();
  const conn = client.getConnection();
  const wallet = client.getWallet();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(poolId);
  const poolState = await client.getPoolState(poolId);

  if (!poolState) {
    throw new Error("Pool not found");
  }

  const [participantsPda] = deriveParticipantsPda(poolPk);
  const poolToken = getAssociatedTokenAddressSync(poolState.mint, poolPk, true, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  const userPk = wallet.publicKey;

  // IDL account order: mint, pool, pool_token, user, token_program, system_program, participants
  const ix = createInstructionWithDiscriminator(
    [182, 4, 161, 221, 98, 188, 73, 145],
    Buffer.alloc(0), // No args
    [
      { pubkey: poolState.mint, isSigner: false, isWritable: true },
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: poolToken, isSigner: false, isWritable: true },
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ]
  );

  const sig = await client.buildAndSendTransaction([ix]);
  console.log("SWEEP_EXPIRED_POOL TX:", sig);

  return { tx: sig };
}

/**
 * Claim Rent - Claims rent from a closed pool
 * Discriminator: [57, 233, 51, 137, 102, 101, 26, 101]
 */
export async function claimRent(poolId: string, closeTarget: PublicKey): Promise<{ tx: string }> {
  const client = getMissoutClient();
  const conn = client.getConnection();
  const wallet = client.getWallet();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(poolId);
  const poolState = await client.getPoolState(poolId);

  if (!poolState) {
    throw new Error("Pool not found");
  }

  const [participantsPda] = deriveParticipantsPda(poolPk);

  const userPk = wallet.publicKey;
  const tokenProgramId = await resolveTokenProgramForMint(conn, poolState.mint);
  const poolToken = getAssociatedTokenAddressSync(poolState.mint, poolPk, true, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);

  // IDL account order: pool, mint, pool_token, close_target, user, token_program, participants
  const ix = createInstructionWithDiscriminator(
    [57, 233, 51, 137, 102, 101, 26, 101],
    Buffer.alloc(0), // No args
    [
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: poolState.mint, isSigner: false, isWritable: true },
      { pubkey: poolToken, isSigner: false, isWritable: true },
      { pubkey: closeTarget, isSigner: false, isWritable: true },
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ]
  );

  const sig = await client.buildAndSendTransaction([ix]);
  console.log("CLAIM_RENT TX:", sig);

  return { tx: sig };
}

/**
 * Set Lock Duration - Updates the lock duration for a pool
 * Discriminator: [197, 198, 131, 75, 25, 116, 20, 111]
 */
export async function setLockDuration(
  poolId: string,
  newLockDuration: number
): Promise<{ tx: string }> {
  const client = getMissoutClient();
  const wallet = client.getWallet();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(poolId);
  const [participantsPda] = deriveParticipantsPda(poolPk);
  const userPk = wallet.publicKey;

  // IDL args: new_lock_duration i64 = 8 bytes
  const dataBuffer = Buffer.alloc(8);
  dataBuffer.writeBigInt64LE(BigInt(newLockDuration), 0);

  // IDL account order: pool, user, participants
  const ix = createInstructionWithDiscriminator(
    [197, 198, 131, 75, 25, 116, 20, 111],
    dataBuffer,
    [
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ]
  );

  const sig = await client.buildAndSendTransaction([ix]);
  console.log("SET_LOCK_DURATION TX:", sig);

  return { tx: sig };
}

// ============================================================================
// BATCH CLAIM FUNCTIONS
// ============================================================================

export interface BatchClaimResult {
  poolId: string;
  success: boolean;
  tx?: string;
  error?: string;
}

export interface BatchClaimProgress {
  current: number;
  total: number;
  poolId: string;
  status: 'pending' | 'sending' | 'confirmed' | 'failed';
}

/**
 * Build a single claim refund instruction without sending
 */
export async function buildClaimRefundInstruction(
  poolId: string
): Promise<{ instruction: TransactionInstruction; poolId: string }> {
  const client = getMissoutClient();
  const wallet = client.getWallet();
  const conn = client.getConnection();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(poolId);
  const poolState = await client.getPoolState(poolId);

  if (!poolState) {
    throw new Error(`Pool not found: ${poolId}`);
  }

  const [participantsPda] = deriveParticipantsPda(poolPk);

  const tokenProgramId = await resolveTokenProgramForMint(conn, poolState.mint);
  const poolToken = getAssociatedTokenAddressSync(poolState.mint, poolPk, true, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  const userPk = wallet.publicKey;
  
  const mintInfo = await conn.getAccountInfo(poolState.mint, "finalized");
  const userToken = getAssociatedTokenAddressSync(poolState.mint, userPk, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  const treasuryToken = getAssociatedTokenAddressSync(poolState.mint, poolState.treasuryWallet, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);

  // Claim Refund instruction - discriminator from IDL: [15, 16, 30, 161, 255, 228, 97, 60]
  // Account order from IDL: mint, pool, pool_token, user_token, treasury_token, user, token_program, participants
  const ix = createInstructionWithDiscriminator(
    [15, 16, 30, 161, 255, 228, 97, 60],
    Buffer.alloc(0),
    [
      { pubkey: poolState.mint, isSigner: false, isWritable: true },
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: poolToken, isSigner: false, isWritable: true },
      { pubkey: userToken, isSigner: false, isWritable: true },
      { pubkey: treasuryToken, isSigner: false, isWritable: true },
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ]
  );

  return { instruction: ix, poolId };
}

/**
 * Build a single claim rent instruction without sending
 */
export async function buildClaimRentInstruction(
  poolId: string,
  closeTarget: PublicKey
): Promise<{ instruction: TransactionInstruction; poolId: string }> {
  const client = getMissoutClient();
  const wallet = client.getWallet();

  if (!wallet?.publicKey) {
    throw new Error("Wallet not connected");
  }

  const poolPk = new PublicKey(poolId);
  const poolState = await client.getPoolState(poolId);

  if (!poolState) {
    throw new Error(`Pool not found: ${poolId}`);
  }

  const [participantsPda] = deriveParticipantsPda(poolPk);
  const poolToken = getAssociatedTokenAddressSync(poolState.mint, poolPk, true, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  const userPk = wallet.publicKey;

  const ix = createInstructionWithDiscriminator(
    [57, 233, 51, 137, 102, 101, 26, 101],
    Buffer.alloc(0),
    [
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: poolState.mint, isSigner: false, isWritable: true },
      { pubkey: poolToken, isSigner: false, isWritable: true },
      { pubkey: closeTarget, isSigner: false, isWritable: true },
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ]
  );

  return { instruction: ix, poolId };
}

/**
 * Batch claim refunds from multiple cancelled pools
 * Chunks instructions to stay within transaction size limits (max 3 per tx)
 */
export async function claimRefundsBatch(
  poolIds: string[],
  onProgress?: (progress: BatchClaimProgress) => void
): Promise<BatchClaimResult[]> {
  const client = getMissoutClient();
  const results: BatchClaimResult[] = [];
  const CHUNK_SIZE = 3; // Conservative limit for transaction size

  // Build all instructions first
  const instructionPromises = poolIds.map(async (poolId, index) => {
    try {
      onProgress?.({ current: index + 1, total: poolIds.length, poolId, status: 'pending' });
      return await buildClaimRefundInstruction(poolId);
    } catch (error: any) {
      results.push({ poolId, success: false, error: error.message });
      return null;
    }
  });

  const builtInstructions = (await Promise.all(instructionPromises)).filter(Boolean) as { instruction: TransactionInstruction; poolId: string }[];

  // Chunk and send transactions
  for (let i = 0; i < builtInstructions.length; i += CHUNK_SIZE) {
    const chunk = builtInstructions.slice(i, i + CHUNK_SIZE);
    const chunkPoolIds = chunk.map(c => c.poolId);
    
    try {
      chunk.forEach((c, idx) => onProgress?.({ 
        current: i + idx + 1, 
        total: builtInstructions.length, 
        poolId: c.poolId, 
        status: 'sending' 
      }));

      const sig = await client.buildAndSendTransaction(chunk.map(c => c.instruction));
      console.log(`BATCH_CLAIM_REFUNDS TX (${chunkPoolIds.join(', ')}):`, sig);

      chunkPoolIds.forEach((poolId, idx) => {
        results.push({ poolId, success: true, tx: sig });
        onProgress?.({ current: i + idx + 1, total: builtInstructions.length, poolId, status: 'confirmed' });
      });
    } catch (error: any) {
      console.error(`Batch refund claim failed for chunk:`, error);
      chunkPoolIds.forEach((poolId, idx) => {
        results.push({ poolId, success: false, error: error.message });
        onProgress?.({ current: i + idx + 1, total: builtInstructions.length, poolId, status: 'failed' });
      });
    }
  }

  return results;
}

/**
 * Batch claim rent from multiple closed pools
 * Chunks instructions to stay within transaction size limits (max 3 per tx)
 */
export async function claimRentsBatch(
  poolIds: string[],
  closeTarget: PublicKey,
  onProgress?: (progress: BatchClaimProgress) => void
): Promise<BatchClaimResult[]> {
  const client = getMissoutClient();
  const results: BatchClaimResult[] = [];
  const CHUNK_SIZE = 3; // Conservative limit for transaction size

  // Build all instructions first
  const instructionPromises = poolIds.map(async (poolId, index) => {
    try {
      onProgress?.({ current: index + 1, total: poolIds.length, poolId, status: 'pending' });
      return await buildClaimRentInstruction(poolId, closeTarget);
    } catch (error: any) {
      results.push({ poolId, success: false, error: error.message });
      return null;
    }
  });

  const builtInstructions = (await Promise.all(instructionPromises)).filter(Boolean) as { instruction: TransactionInstruction; poolId: string }[];

  // Chunk and send transactions
  for (let i = 0; i < builtInstructions.length; i += CHUNK_SIZE) {
    const chunk = builtInstructions.slice(i, i + CHUNK_SIZE);
    const chunkPoolIds = chunk.map(c => c.poolId);
    
    try {
      chunk.forEach((c, idx) => onProgress?.({ 
        current: i + idx + 1, 
        total: builtInstructions.length, 
        poolId: c.poolId, 
        status: 'sending' 
      }));

      const sig = await client.buildAndSendTransaction(chunk.map(c => c.instruction));
      console.log(`BATCH_CLAIM_RENTS TX (${chunkPoolIds.join(', ')}):`, sig);

      chunkPoolIds.forEach((poolId, idx) => {
        results.push({ poolId, success: true, tx: sig });
        onProgress?.({ current: i + idx + 1, total: builtInstructions.length, poolId, status: 'confirmed' });
      });
    } catch (error: any) {
      console.error(`Batch rent claim failed for chunk:`, error);
      chunkPoolIds.forEach((poolId, idx) => {
        results.push({ poolId, success: false, error: error.message });
        onProgress?.({ current: i + idx + 1, total: builtInstructions.length, poolId, status: 'failed' });
      });
    }
  }

  return results;
}