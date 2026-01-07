import { PublicKey, Connection, Keypair, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import bs58 from "bs58";
import { IDL } from "../../client/src/lib/solana-sdk/idl.js";
import { AnchorUtils, Randomness } from "@switchboard-xyz/on-demand";
import { pool as dbPool } from "../db.js";

const log = (...args: any[]) => console.log("[MONITOR]", ...args);

// Global Anchor program and wallets
let program: Program | null = null;
let devWallet: Keypair | null = null;
let treasuryWallet: PublicKey | null = null;
let connection: Connection | null = null;

// Constants from SDK
const PROGRAM_ID = new PublicKey("53oTPbfy559uTaJQAbuWeAN1TyWXK1KfxUsM2GPJtrJw");

// Switchboard Configuration
const SWITCHBOARD_PROGRAM_ID = new PublicKey(process.env.SWITCHBOARD_PROGRAM_ID || "Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2");
const SWITCHBOARD_QUEUE = new PublicKey(process.env.SWITCHBOARD_QUEUE || "EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7");

/**
 * Initialize Solana services - Load DEV wallet and TREASURY wallet from ENV
 */
export async function initializeSolanaServices(): Promise<void> {
  const devPrivateKey = process.env.DEV_WALLET_PRIVATE_KEY;
  const treasuryPublicKey = process.env.TREASURY_WALLET_PUBKEY || process.env.TREASURY_WALLET_PUBLIC_KEY;
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

  if (!devPrivateKey) {
    throw new Error("DEV_WALLET_PRIVATE_KEY not found in environment variables");
  }

  if (!treasuryPublicKey) {
    throw new Error("TREASURY_WALLET_PUBKEY not found in environment variables");
  }

  log("Initializing Solana services...");

  try {
    // Parse DEV private key (supports JSON array or base58)
    let secretKey: Uint8Array;

    if (devPrivateKey.startsWith("[")) {
      const keyArray = JSON.parse(devPrivateKey);
      secretKey = new Uint8Array(keyArray);
    } else {
      secretKey = bs58.decode(devPrivateKey);
    }

    devWallet = Keypair.fromSecretKey(secretKey);
    log("✅ DEV wallet loaded:", devWallet.publicKey.toBase58());

    // Parse treasury public key
    treasuryWallet = new PublicKey(treasuryPublicKey);
    log("✅ Treasury wallet loaded:", treasuryWallet.toBase58());

    // Initialize connection and Anchor program
    connection = new Connection(rpcUrl, "confirmed");

    const wallet = new Wallet(devWallet);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    program = new Program(IDL as any, provider);

    log("✅ Anchor program initialized");
  } catch (err: any) {
    log("❌ Failed to initialize Solana services:", err.message);
    throw err;
  }
}

/**
 * Get Anchor program instance
 */
function getProgram(): Program {
  if (!program) {
    throw new Error("Anchor program not initialized. Call initializeSolanaServices() first.");
  }
  return program;
}

/**
 * Get connection instance
 */
function getConnection(): Connection {
  if (!connection) {
    throw new Error("Connection not initialized. Call initializeSolanaServices() first.");
  }
  return connection;
}

/**
 * Get DEV wallet
 */
function getDevWallet(): Keypair {
  if (!devWallet) {
    throw new Error("DEV wallet not initialized. Call initializeSolanaServices() first.");
  }
  return devWallet;
}

/**
 * Get Treasury wallet
 */
function getTreasuryWallet(): PublicKey {
  if (!treasuryWallet) {
    throw new Error("Treasury wallet not initialized. Call initializeSolanaServices() first.");
  }
  return treasuryWallet;
}

/**
 * Derive participants PDA
 */
function deriveParticipantsPda(poolPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("participants"), poolPubkey.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Derive pool token address
 */
function derivePoolTokenAddress(mint: PublicKey, pool: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, pool, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
}

/**
 * Check if pool should use mock randomness
 * Checks allowMock flag in database
 */
async function isMockForPool(poolAddress: string): Promise<boolean> {
  try {
    const pool = await dbPool.query(
      'SELECT allow_mock FROM pools WHERE pool_address = $1',
      [poolAddress]
    );

    if (pool.rows.length === 0) {
      log(`pool=${poolAddress.slice(0, 8)} No DB record found, defaulting to real randomness`);
      return false;
    }

    const allowMock = pool.rows[0].allow_mock === 1;
    log(`pool=${poolAddress.slice(0, 8)} allowMock=${allowMock}`);
    return allowMock;
  } catch (err: any) {
    log(`pool=${poolAddress.slice(0, 8)} Error checking allowMock: ${err.message}, defaulting to real randomness`);
    return false;
  }
}

/**
 * Create instruction with discriminator
 */
function createInstructionWithDiscriminator(
  discriminator: number[],
  data: Buffer,
  keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
): TransactionInstruction {
  const fullData = Buffer.concat([Buffer.from(discriminator), data]);
  return new TransactionInstruction({
    keys,
    programId: PROGRAM_ID,
    data: fullData,
  });
}

/**
 * ANCHOR-LEVEL POOL WARM-UP (Backend version)
 * Wait for Anchor to successfully deserialize the Pool account.
 */
async function waitForAnchorPool(
  poolPubkey: PublicKey,
  maxRetries = 15,
  delayMs = 1000
): Promise<boolean> {
  const prog = getProgram();

  if (!prog.account || !(prog.account as any).pool) {
    log(`❌ Anchor Program not initialized properly`);
    return false;
  }

  for (let i = 0; i < maxRetries; i++) {
    try {
      const poolData = await (prog.account as any).pool.fetch(poolPubkey, "confirmed");

      if (poolData && poolData.initialized === true) {
        log(`pool=${poolPubkey.toBase58().slice(0, 8)} ✅ Anchor ready after ${i + 1} attempts`);
        return true;
      }
    } catch (err: any) {
      const errMsg = err.message || String(err);
      log(`pool=${poolPubkey.toBase58().slice(0, 8)} Anchor warm-up attempt ${i + 1}/${maxRetries}: ${errMsg.slice(0, 60)}`);
    }

    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  log(`pool=${poolPubkey.toBase58().slice(0, 8)} ❌ Anchor warm-up timeout after ${maxRetries * delayMs / 1000}s`);
  return false;
}

/**
 * Fetch pool state from on-chain using Anchor
 */
export async function fetchPoolStateOnChain(poolAddress: string): Promise<any> {
  const prog = getProgram();
  const poolPk = new PublicKey(poolAddress);

  log(`pool=${poolAddress.slice(0, 8)} Fetching on-chain state...`);

  // Wait for Anchor readiness
  const ready = await waitForAnchorPool(poolPk, 10, 1000);
  if (!ready) {
    throw new Error(`Pool ${poolAddress} not ready - Anchor cannot deserialize`);
  }

  try {
    const poolData = await (prog.account as any).pool.fetch(poolPk, "confirmed");
    log(`pool=${poolAddress.slice(0, 8)} state=${getPoolStatusString(poolData.status)}`);
    return poolData;
  } catch (err: any) {
    log(`pool=${poolAddress.slice(0, 8)} ❌ Failed to fetch state: ${err.message}`);
    throw err;
  }
}

/**
 * Get pool status as string
 */
function getPoolStatusString(status: any): string {
  if (status.open !== undefined) return "Open";
  if (status.locked !== undefined) return "Locked";
  if (status.unlocked !== undefined) return "Unlocked";
  if (status.randomnessCommitted !== undefined) return "RandomnessCommitted";
  if (status.randomnessRevealed !== undefined) return "RandomnessRevealed";
  if (status.winnerSelected !== undefined) return "WinnerSelected";
  if (status.ended !== undefined) return "Ended";
  if (status.cancelled !== undefined) return "Cancelled";
  if (status.closed !== undefined) return "Closed";
  return "Unknown";
}

/**
 * Unlock pool on-chain
 * Uses unlock_pool instruction with correct accounts
 */
export async function unlockPoolOnChain(poolAddress: string): Promise<void> {
  const conn = getConnection();
  const poolPk = new PublicKey(poolAddress);
  const userPk = getDevWallet().publicKey;

  log(`pool=${poolAddress.slice(0, 8)} action=UNLOCK Starting...`);

  // PREVENTIVE: Check if already unlocked
  const poolData = await fetchPoolStateOnChain(poolAddress);
  const status = getPoolStatusString(poolData.status);

  if (status === "Unlocked" || status === "RandomnessCommitted" || status === "RandomnessRevealed" || status === "WinnerSelected" || status === "Ended") {
    log(`pool=${poolAddress.slice(0, 8)} action=UNLOCK reason=SKIP_ALREADY_${status}`);
    return;
  }

  const [participantsPda] = deriveParticipantsPda(poolPk);

  // unlock_pool discriminator: [51, 19, 234, 156, 255, 183, 89, 254]
  const ix = createInstructionWithDiscriminator(
    [51, 19, 234, 156, 255, 183, 89, 254],
    Buffer.alloc(0),
    [
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: participantsPda, isSigner: false, isWritable: false },
    ]
  );

  try {
    const tx = await (getProgram().provider as AnchorProvider).sendAndConfirm(
      (await (getProgram().provider as AnchorProvider).wallet.signTransaction(
        await conn.getLatestBlockhash().then(async (blockhash) => {
          const transaction = new (await import("@solana/web3.js")).Transaction();
          transaction.recentBlockhash = blockhash.blockhash;
          transaction.feePayer = userPk;
          transaction.add(ix);
          return transaction;
        })
      ))
    );

    log(`pool=${poolAddress.slice(0, 8)} action=UNLOCK ✅ TX_SENT=${tx.slice(0, 16)}`);
    await conn.confirmTransaction(tx, "confirmed");
    log(`pool=${poolAddress.slice(0, 8)} action=UNLOCK ✅ TX_CONFIRMED=${tx.slice(0, 16)}`);
  } catch (err: any) {
    log(`pool=${poolAddress.slice(0, 8)} action=UNLOCK ❌ FAILED: ${err.message}`);
    throw err;
  }
}

/**
 * Request randomness on-chain
 * MOCK MODE: Skips Switchboard and passes SystemProgram as sentinel
 * REAL MODE: Creates Switchboard Randomness Account, commits, and calls request_randomness instruction
 */
export async function requestRandomnessOnChain(poolAddress: string): Promise<void> {
  const conn = getConnection();
  const poolPk = new PublicKey(poolAddress);
  const userPk = getDevWallet().publicKey;
  const payer = getDevWallet();

  log(`pool=${poolAddress.slice(0, 8)} action=REQUEST_RANDOMNESS Starting...`);

  // PREVENTIVE: Check if already requested
  const poolData = await fetchPoolStateOnChain(poolAddress);
  const status = getPoolStatusString(poolData.status);

  if (status === "RandomnessCommitted" || status === "RandomnessRevealed" || status === "WinnerSelected" || status === "Ended") {
    log(`pool=${poolAddress.slice(0, 8)} action=REQUEST_RANDOMNESS reason=SKIP_ALREADY_${status}`);
    return;
  }

  // Check if pool should use mock randomness
  const useMock = await isMockForPool(poolAddress);

  let randomnessAccount: PublicKey;

  if (useMock) {
    // MOCK MODE: Use SystemProgram as sentinel (matches on-chain condition)
    log(`pool=${poolAddress.slice(0, 8)} 🧪 MOCK MODE: Skipping Switchboard, using SystemProgram sentinel`);
    randomnessAccount = SystemProgram.programId;
  } else {
    // REAL MODE: Create Switchboard Randomness Account
    const wallet = new Wallet(payer);

    log(`pool=${poolAddress.slice(0, 8)} Loading Switchboard program...`);
    const sbProgram = await AnchorUtils.loadProgramFromConnection(conn, wallet, SWITCHBOARD_PROGRAM_ID);

    const rngKeypair = Keypair.generate();
    log(`pool=${poolAddress.slice(0, 8)} Creating Switchboard randomness account: ${rngKeypair.publicKey.toBase58().slice(0, 8)}...`);

    const [rngObj, createIx] = await Randomness.create(sbProgram, rngKeypair, SWITCHBOARD_QUEUE);

    log(`pool=${poolAddress.slice(0, 8)} rngObj created, pubkey: ${rngObj.pubkey.toBase58().slice(0, 8)}`);

    try {
      const { Transaction } = await import("@solana/web3.js");

      // Transaction 1: CREATE randomness account
      const tx1 = new Transaction();
      const bh1 = await conn.getLatestBlockhash();
      tx1.recentBlockhash = bh1.blockhash;
      tx1.feePayer = userPk;
      tx1.add(createIx);

      tx1.sign(payer, rngKeypair);
      const sig1 = await conn.sendRawTransaction(tx1.serialize());
      log(`pool=${poolAddress.slice(0, 8)} action=SB_CREATE ✅ TX_SENT=${sig1.slice(0, 16)}`);
      await conn.confirmTransaction(sig1, "confirmed");
      log(`pool=${poolAddress.slice(0, 8)} action=SB_CREATE ✅ TX_CONFIRMED=${sig1.slice(0, 16)}`);

      // Step 2: NOW create commitIx (account exists now)
      log(`pool=${poolAddress.slice(0, 8)} Creating commitIx...`);
      const commitIx = await rngObj.commitIx(SWITCHBOARD_QUEUE);

      // Transaction 2: COMMIT randomness
      const tx2 = new Transaction();
      const bh2 = await conn.getLatestBlockhash();
      tx2.recentBlockhash = bh2.blockhash;
      tx2.feePayer = userPk;
      tx2.add(commitIx);

      tx2.sign(payer);
      const sig2 = await conn.sendRawTransaction(tx2.serialize());
      log(`pool=${poolAddress.slice(0, 8)} action=SB_COMMIT ✅ TX_SENT=${sig2.slice(0, 16)}`);
      await conn.confirmTransaction(sig2, "confirmed");
      log(`pool=${poolAddress.slice(0, 8)} action=SB_COMMIT ✅ TX_CONFIRMED=${sig2.slice(0, 16)}`);

      randomnessAccount = rngObj.pubkey;
    } catch (err: any) {
      log(`pool=${poolAddress.slice(0, 8)} action=REQUEST_RANDOMNESS ❌ Switchboard FAILED: ${err.message}`);
      throw err;
    }
  }

  // Step 3: Create pool's request_randomness instruction (works for both mock and real)
  const [participantsPda] = deriveParticipantsPda(poolPk);

  const requestIx = createInstructionWithDiscriminator(
    [213, 5, 173, 166, 37, 236, 31, 18],
    Buffer.alloc(0),
    [
      { pubkey: randomnessAccount, isSigner: false, isWritable: false },
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: userPk, isSigner: true, isWritable: false },
      { pubkey: participantsPda, isSigner: false, isWritable: false },
    ]
  );

  try {
    const { Transaction } = await import("@solana/web3.js");

    // Transaction: REQUEST randomness on pool
    const tx = new Transaction();
    const bh = await conn.getLatestBlockhash();
    tx.recentBlockhash = bh.blockhash;
    tx.feePayer = userPk;
    tx.add(requestIx);

    tx.sign(payer);
    const sig = await conn.sendRawTransaction(tx.serialize());

    log(`pool=${poolAddress.slice(0, 8)} action=REQUEST_RANDOMNESS ✅ TX_SENT=${sig.slice(0, 16)}`);
    await conn.confirmTransaction(sig, "confirmed");
    log(`pool=${poolAddress.slice(0, 8)} action=REQUEST_RANDOMNESS ✅ TX_CONFIRMED=${sig.slice(0, 16)} mode=${useMock ? 'MOCK' : 'REAL'} rng=${randomnessAccount.toBase58().slice(0, 16)}`);
  } catch (err: any) {
    log(`pool=${poolAddress.slice(0, 8)} action=REQUEST_RANDOMNESS ❌ FAILED: ${err.message}`);
    throw err;
  }
}

/**
 * Reveal randomness on Switchboard
 * MOCK MODE: Skips reveal (instant winner selection)
 * REAL MODE: Calls revealIx() on the Switchboard randomness account
 */
export async function revealRandomnessOnChain(poolAddress: string): Promise<void> {
  const conn = getConnection();
  const payer = getDevWallet();

  log(`pool=${poolAddress.slice(0, 8)} action=REVEAL_RANDOMNESS Starting...`);

  // Get pool data to find randomness account
  const poolData = await fetchPoolStateOnChain(poolAddress);
  const status = getPoolStatusString(poolData.status);

  if (status !== "RandomnessCommitted") {
    log(`pool=${poolAddress.slice(0, 8)} action=REVEAL_RANDOMNESS reason=SKIP_WRONG_STATUS status=${status}`);
    return;
  }

  const randomnessAccount = poolData.randomnessAccount;
  if (!randomnessAccount) {
    throw new Error("Pool has no randomness_account");
  }

  // Check if using mock randomness (SystemProgram sentinel)
  const useMock = await isMockForPool(poolAddress);

  if (useMock || randomnessAccount.equals(SystemProgram.programId)) {
    log(`pool=${poolAddress.slice(0, 8)} 🧪 MOCK MODE: Skipping Switchboard reveal, ready for instant winner selection`);
    return;
  }

  // Load Switchboard program
  const wallet = new Wallet(payer);
  log(`pool=${poolAddress.slice(0, 8)} Loading Switchboard program for reveal...`);
  const sbProgram = await AnchorUtils.loadProgramFromConnection(conn, wallet, SWITCHBOARD_PROGRAM_ID);

  // Create Randomness object
  const rng = new Randomness(sbProgram, randomnessAccount);

  // Check if already revealed
  try {
    const data = await rng.loadData();
    if (data.revealSlot.toString() !== "0") {
      log(`pool=${poolAddress.slice(0, 8)} action=REVEAL_RANDOMNESS reason=ALREADY_REVEALED`);
      return;
    }
  } catch (err) {
    // Account might not be readable yet, continue
  }

  // Small delay for block progression
  await new Promise((r) => setTimeout(r, 3000));

  try {
    const { Transaction } = await import("@solana/web3.js");

    // Create reveal instruction
    const revealIx = await rng.revealIx();

    // Send reveal transaction
    const tx = new Transaction();
    const bh = await conn.getLatestBlockhash();
    tx.recentBlockhash = bh.blockhash;
    tx.feePayer = payer.publicKey;
    tx.add(revealIx);

    tx.sign(payer);
    const sig = await conn.sendRawTransaction(tx.serialize());

    log(`pool=${poolAddress.slice(0, 8)} action=REVEAL_RANDOMNESS ✅ TX_SENT=${sig.slice(0, 16)}`);
    await conn.confirmTransaction(sig, "confirmed");
    log(`pool=${poolAddress.slice(0, 8)} action=REVEAL_RANDOMNESS ✅ TX_CONFIRMED=${sig.slice(0, 16)}`);

    // Verify reveal was successful
    const afterData = await rng.loadData();
    const valueHex = Buffer.from(afterData.value).toString("hex");

    if (afterData.revealSlot.toString() === "0") {
      throw new Error("Reveal incomplete - revealSlot still 0");
    }

    if (/^0+$/.test(valueHex)) {
      throw new Error("Invalid randomness - all zeros");
    }

    log(`pool=${poolAddress.slice(0, 8)} action=REVEAL_RANDOMNESS ✅ Valid randomness: ${valueHex.slice(0, 16)}...`);
  } catch (err: any) {
    log(`pool=${poolAddress.slice(0, 8)} action=REVEAL_RANDOMNESS ❌ FAILED: ${err.message}`);
    throw err;
  }
}

/**
 * Select winner on-chain
 * MOCK MODE: Uses SystemProgram sentinel for instant winner selection
 * REAL MODE: Uses Switchboard randomness account
 */
export async function selectWinnerOnChain(poolAddress: string): Promise<void> {
  const conn = getConnection();
  const poolPk = new PublicKey(poolAddress);
  const userPk = getDevWallet().publicKey;

  log(`pool=${poolAddress.slice(0, 8)} action=SELECT_WINNER Starting...`);

  // PREVENTIVE: Check if already selected
  const poolData = await fetchPoolStateOnChain(poolAddress);
  const status = getPoolStatusString(poolData.status);

  if (status === "WinnerSelected" || status === "Ended") {
    log(`pool=${poolAddress.slice(0, 8)} action=SELECT_WINNER reason=SKIP_ALREADY_${status}`);
    return;
  }

  const randomnessAccount = poolData.randomnessAccount;
  if (!randomnessAccount) {
    throw new Error("Pool has no randomness_account field");
  }

  // Check if using mock randomness
  const useMock = await isMockForPool(poolAddress);

  // For mock mode or if randomness is SystemProgram, use SystemProgram as sentinel
  const randomnessForInstruction = (useMock || randomnessAccount.equals(SystemProgram.programId))
    ? SystemProgram.programId
    : randomnessAccount;

  if (useMock || randomnessAccount.equals(SystemProgram.programId)) {
    log(`pool=${poolAddress.slice(0, 8)} 🧪 MOCK MODE: Using SystemProgram sentinel for winner selection`);
  }

  const [participantsPda] = deriveParticipantsPda(poolPk);

  // select_winner discriminator: [119, 66, 44, 236, 79, 158, 82, 51]
  const ix = createInstructionWithDiscriminator(
    [119, 66, 44, 236, 79, 158, 82, 51],
    Buffer.alloc(0),
    [
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: randomnessForInstruction, isSigner: false, isWritable: false },
      { pubkey: userPk, isSigner: true, isWritable: false },
      { pubkey: participantsPda, isSigner: false, isWritable: false },
    ]
  );

  try {
    const latestBlockhash = await conn.getLatestBlockhash();
    const { Transaction } = await import("@solana/web3.js");
    const transaction = new Transaction();
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = userPk;
    transaction.add(ix);

    transaction.sign(getDevWallet());
    const tx = await conn.sendRawTransaction(transaction.serialize());

    log(`pool=${poolAddress.slice(0, 8)} action=SELECT_WINNER ✅ TX_SENT=${tx.slice(0, 16)}`);
    await conn.confirmTransaction(tx, "confirmed");

    // Fetch updated pool state to get the actual winner
    const updatedPoolData = await fetchPoolStateOnChain(poolAddress);
    const winnerAddress = updatedPoolData.winner?.toBase58() || 'ZERO_PUBKEY';

    log(`pool=${poolAddress.slice(0, 8)} action=SELECT_WINNER ✅ TX_CONFIRMED=${tx.slice(0, 16)} winner=${winnerAddress.slice(0, 16)}`);
  } catch (err: any) {
    log(`pool=${poolAddress.slice(0, 8)} action=SELECT_WINNER ❌ FAILED: ${err.message}`);
    throw err;
  }
}

/**
 * Payout winner on-chain
 * Uses payout_winner instruction with all required accounts
 */
export async function payoutWinnerOnChain(poolAddress: string): Promise<void> {
  const conn = getConnection();
  const poolPk = new PublicKey(poolAddress);
  const userPk = getDevWallet().publicKey;

  log(`pool=${poolAddress.slice(0, 8)} action=PAYOUT Starting...`);

  // PREVENTIVE: Check if already paid out
  const poolData = await fetchPoolStateOnChain(poolAddress);
  const status = getPoolStatusString(poolData.status);

  if (status === "Ended") {
    log(`pool=${poolAddress.slice(0, 8)} action=PAYOUT reason=SKIP_ALREADY_ENDED`);
    return;
  }

  const [participantsPda] = deriveParticipantsPda(poolPk);
  const poolToken = derivePoolTokenAddress(poolData.mint, poolPk);

  const mintInfo = await conn.getAccountInfo(poolData.mint, "confirmed");
  const tokenProgramId = mintInfo?.owner || TOKEN_PROGRAM_ID;

  const winnerToken = getAssociatedTokenAddressSync(poolData.mint, poolData.winner, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  const devToken = getAssociatedTokenAddressSync(poolData.mint, poolData.devWallet, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  // CRITICAL: Use pool's treasury_wallet from on-chain state, not from ENV
  const treasuryToken = getAssociatedTokenAddressSync(poolData.mint, poolData.treasuryWallet, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);

  // payout_winner discriminator: [192, 241, 157, 158, 130, 150, 10, 8]
  const ix = createInstructionWithDiscriminator(
    [192, 241, 157, 158, 130, 150, 10, 8],
    Buffer.alloc(0),
    [
      { pubkey: poolData.mint, isSigner: false, isWritable: true },
      { pubkey: poolPk, isSigner: false, isWritable: true },
      { pubkey: poolToken, isSigner: false, isWritable: true },
      { pubkey: winnerToken, isSigner: false, isWritable: true },
      { pubkey: devToken, isSigner: false, isWritable: true },
      { pubkey: treasuryToken, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: poolData.winner, isSigner: false, isWritable: false },
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: participantsPda, isSigner: false, isWritable: true },
    ]
  );

  try {
    const latestBlockhash = await conn.getLatestBlockhash();
    const { Transaction } = await import("@solana/web3.js");
    const transaction = new Transaction();
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = userPk;
    transaction.add(ix);

    transaction.sign(getDevWallet());
    const tx = await conn.sendRawTransaction(transaction.serialize());

    log(`pool=${poolAddress.slice(0, 8)} action=PAYOUT ✅ TX_SENT=${tx.slice(0, 16)}`);
    await conn.confirmTransaction(tx, "confirmed");
    log(`pool=${poolAddress.slice(0, 8)} action=PAYOUT ✅ TX_CONFIRMED=${tx.slice(0, 16)} winner=${poolData.winner.toBase58().slice(0, 16)}`);
  } catch (err: any) {
    log(`pool=${poolAddress.slice(0, 8)} action=PAYOUT ❌ FAILED: ${err.message}`);
    throw err;
  }
}
