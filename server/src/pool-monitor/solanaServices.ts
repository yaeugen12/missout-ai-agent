import { PublicKey, Connection, Keypair, SystemProgram, TransactionInstruction, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js/lib/index.cjs.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createTransferCheckedInstruction, getAccount } from "@solana/spl-token";
import bs58 from "bs58";
import { IDL } from "@shared/idl.js";
import { AnchorUtils, Randomness, getDefaultQueue, getDefaultDevnetQueue, Queue } from "@switchboard-xyz/on-demand";
import { pool as dbPool } from "../db.js";
import { rpcManager } from "../rpc-manager";
import { resolveTokenProgramForMint } from "@shared/token-program-utils.js";
import { getNetworkConfig, validateNetworkConfig, getCurrentNetwork } from "@shared/network-config.js";

const log = (...args: any[]) => console.log("[MONITOR]", ...args);

// Global Anchor program and wallets
let program: Program | null = null;
let devWallet: Keypair | null = null;
let treasuryWallet: PublicKey | null = null;
let treasuryKeypair: Keypair | null = null;
let connection: Connection | null = null;

// Auxiliary wallets for sponsored/free pools (max 9 participants)
const auxiliaryWallets: Keypair[] = [];

// Network configuration - loads based on SOLANA_NETWORK environment variable
const networkConfig = getNetworkConfig(
  process.env.SOLANA_NETWORK,
  process.env.SOLANA_RPC_URL
);

// Validate configuration on startup
validateNetworkConfig(networkConfig);

// Constants from network config
const PROGRAM_ID = networkConfig.programId;
const SWITCHBOARD_PROGRAM_ID = process.env.SWITCHBOARD_PROGRAM_ID
  ? new PublicKey(process.env.SWITCHBOARD_PROGRAM_ID)
  : networkConfig.switchboard.programId;
const SWITCHBOARD_QUEUE = process.env.SWITCHBOARD_QUEUE
  ? new PublicKey(process.env.SWITCHBOARD_QUEUE)
  : networkConfig.switchboard.queue;

// Log network configuration on startup
log(`🌐 Network: ${networkConfig.network}`);
log(`📍 Program ID: ${PROGRAM_ID.toString()}`);
log(`🔀 Switchboard Queue: ${SWITCHBOARD_QUEUE.toString()}`);

/**
 * Initialize Solana services - Load DEV wallet and TREASURY wallet from ENV
 */
export async function initializeSolanaServices(): Promise<void> {
  const devPrivateKey = process.env.DEV_WALLET_PRIVATE_KEY;
  const treasuryPublicKey = process.env.TREASURY_WALLET_PUBKEY || process.env.TREASURY_WALLET_PUBLIC_KEY;
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

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
    log("✅ Treasury wallet (public) loaded:", treasuryWallet.toBase58());

    // Load treasury keypair from private key if available (for referral payouts)
    const treasuryPrivateKey = process.env.TREASURY_WALLET_PRIVATE_KEY;
    if (treasuryPrivateKey) {
      try {
        let treasurySecretKey: Uint8Array;
        if (treasuryPrivateKey.startsWith("[")) {
          const keyArray = JSON.parse(treasuryPrivateKey);
          treasurySecretKey = new Uint8Array(keyArray);
        } else {
          treasurySecretKey = bs58.decode(treasuryPrivateKey);
        }
        treasuryKeypair = Keypair.fromSecretKey(treasurySecretKey);
        log("✅ Treasury keypair loaded for payouts:", treasuryKeypair.publicKey.toBase58());
      } catch (err: any) {
        log("⚠️ Treasury private key provided but failed to parse:", err.message);
        log("⚠️ Referral payouts will not be available");
      }
    } else {
      log("⚠️ TREASURY_WALLET_PRIVATE_KEY not set - referral payouts disabled");
    }

    // Load auxiliary wallets for sponsored/free pools (up to 9 wallets)
    log("Loading auxiliary wallets for free pools...");
    for (let i = 1; i <= 9; i++) {
      const privateKeyEnv = process.env[`AUXILIARY_WALLET_${i}_PRIVATE_KEY`];
      if (privateKeyEnv) {
        try {
          const secretKey = bs58.decode(privateKeyEnv);
          const keypair = Keypair.fromSecretKey(secretKey);
          auxiliaryWallets.push(keypair);
          log(`✅ Auxiliary wallet ${i} loaded:`, keypair.publicKey.toBase58());
        } catch (err: any) {
          log(`⚠️ Failed to load auxiliary wallet ${i}:`, err.message);
        }
      }
    }
    log(`✅ Loaded ${auxiliaryWallets.length}/9 auxiliary wallets for free pools`);

    // Initialize connection and Anchor program using RPC failover manager
    connection = rpcManager.getConnection();

    const wallet = new Wallet(devWallet);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    program = new Program(IDL as any, provider);

    log("✅ Anchor program initialized with RPC failover");
    log("✅ RPC endpoints:", rpcManager.getStats().totalEndpoints);
  } catch (err: any) {
    log("❌ Failed to initialize Solana services:", err.message);
    throw err;
  }
}

// Pool economics tracking - stores costs per pool
const poolEconomics = new Map<string, {
  unlockCost: number;
  randomnessCost: number;
  revealCost: number;
  selectWinnerCost: number;
  payoutCost: number;
  totalCost: number;
  devFeeReceived: number;
}>();

/**
 * Track SOL spent by DEV_WALLET for a transaction
 */
async function trackTransactionCost(
  poolAddress: string,
  action: 'unlock' | 'randomness' | 'reveal' | 'selectWinner' | 'payout',
  txFunc: () => Promise<void>
): Promise<void> {
  const conn = getConnection();
  const devWalletPubkey = getDevWallet().publicKey;

  // Get balance before
  const balanceBefore = await conn.getBalance(devWalletPubkey);
  const balanceBeforeSOL = balanceBefore / LAMPORTS_PER_SOL;

  log(`pool=${poolAddress.slice(0, 8)} action=${action} 💰 DEV_WALLET balance BEFORE: ${balanceBeforeSOL.toFixed(6)} SOL`);

  // Execute transaction
  await txFunc();

  // Get balance after
  const balanceAfter = await conn.getBalance(devWalletPubkey);
  const balanceAfterSOL = balanceAfter / LAMPORTS_PER_SOL;
  const costSOL = balanceBeforeSOL - balanceAfterSOL;

  log(`pool=${poolAddress.slice(0, 8)} action=${action} 💰 DEV_WALLET balance AFTER: ${balanceAfterSOL.toFixed(6)} SOL`);
  log(`pool=${poolAddress.slice(0, 8)} action=${action} 💸 COST: ${costSOL.toFixed(6)} SOL ($${(costSOL * 150).toFixed(2)} @ $150/SOL)`);

  // Store cost
  if (!poolEconomics.has(poolAddress)) {
    poolEconomics.set(poolAddress, {
      unlockCost: 0,
      randomnessCost: 0,
      revealCost: 0,
      selectWinnerCost: 0,
      payoutCost: 0,
      totalCost: 0,
      devFeeReceived: 0,
    });
  }

  const economics = poolEconomics.get(poolAddress)!;

  if (action === 'unlock') economics.unlockCost = costSOL;
  else if (action === 'randomness') economics.randomnessCost = costSOL;
  else if (action === 'reveal') economics.revealCost = costSOL;
  else if (action === 'selectWinner') economics.selectWinnerCost = costSOL;
  else if (action === 'payout') economics.payoutCost = costSOL;

  economics.totalCost = economics.unlockCost + economics.randomnessCost +
                        economics.revealCost + economics.selectWinnerCost + economics.payoutCost;
}

/**
 * Get economics report for a pool
 */
export function getPoolEconomicsReport(poolAddress: string): string {
  const economics = poolEconomics.get(poolAddress);

  if (!economics) {
    return `No economics data for pool ${poolAddress}`;
  }

  const lines = [
    "",
    "╔════════════════════════════════════════════════════════════╗",
    `║  POOL ECONOMICS REPORT: ${poolAddress.slice(0, 12)}...          ║`,
    "╠════════════════════════════════════════════════════════════╣",
    "║ DEV_WALLET COSTS (Transaction Fees)                       ║",
    `║   unlock_pool:        ${economics.unlockCost.toFixed(6)} SOL = $${(economics.unlockCost * 150).toFixed(2).padStart(6)}  ║`,
    `║   request_randomness: ${economics.randomnessCost.toFixed(6)} SOL = $${(economics.randomnessCost * 150).toFixed(2).padStart(6)}  ║`,
    `║   reveal_randomness:  ${economics.revealCost.toFixed(6)} SOL = $${(economics.revealCost * 150).toFixed(2).padStart(6)}  ║`,
    `║   select_winner:      ${economics.selectWinnerCost.toFixed(6)} SOL = $${(economics.selectWinnerCost * 150).toFixed(2).padStart(6)}  ║`,
    `║   payout_winner:      ${economics.payoutCost.toFixed(6)} SOL = $${(economics.payoutCost * 150).toFixed(2).padStart(6)}  ║`,
    "║   " + "─".repeat(56) + " ║",
    `║   TOTAL COST:         ${economics.totalCost.toFixed(6)} SOL = $${(economics.totalCost * 150).toFixed(2).padStart(6)}  ║`,
    "╠════════════════════════════════════════════════════════════╣",
    "║ DEV_WALLET REVENUE (5% Fee)                                ║",
    `║   Dev Fee Received:   ${economics.devFeeReceived.toFixed(2)} tokens                  ║`,
    "║                                                            ║",
    "║ NOTE: Revenue in tokens - check token price to calculate  ║",
    "║       if profitable. Break-even if fee value > total cost  ║",
    "╚════════════════════════════════════════════════════════════╝",
    "",
  ];

  return lines.join("\n");
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
 * Get Treasury wallet (public key)
 */
function getTreasuryWallet(): PublicKey {
  if (!treasuryWallet) {
    throw new Error("Treasury wallet not initialized. Call initializeSolanaServices() first.");
  }
  return treasuryWallet;
}

/**
 * Get Treasury keypair (for signing payout transactions)
 */
export function getTreasuryKeypair(): Keypair | null {
  return treasuryKeypair;
}

/**
 * Check if treasury payouts are enabled
 */
export function isTreasuryPayoutEnabled(): boolean {
  return treasuryKeypair !== null;
}

/**
 * Pay out referral reward from treasury wallet to recipient
 * @param recipientWallet - The wallet address to send the reward to
 * @param tokenMint - The SPL token mint address
 * @param amount - Amount in token's base units (e.g., lamports for SOL, smallest unit for tokens)
 * @param decimals - Token decimals (default 9 for SOL)
 * @returns Transaction signature or error
 */
export async function payReferralReward(
  recipientWallet: string,
  tokenMint: string,
  amount: bigint,
  decimals: number = 9
): Promise<{ success: boolean; signature?: string; error?: string }> {
  if (!treasuryKeypair) {
    return { success: false, error: "Treasury keypair not configured for payouts" };
  }

  if (!connection) {
    return { success: false, error: "Connection not initialized" };
  }

  try {
    const recipient = new PublicKey(recipientWallet);
    const mint = new PublicKey(tokenMint);
    const amountNumber = Number(amount);

    // Resolve token program for this mint (TOKEN_PROGRAM_ID or TOKEN_2022_PROGRAM_ID)
    const tokenProgramId = await resolveTokenProgramForMint(mint, connection);

    // Get associated token accounts
    const treasuryTokenAccount = getAssociatedTokenAddressSync(
      mint,
      treasuryKeypair.publicKey,
      false,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const recipientTokenAccount = getAssociatedTokenAddressSync(
      mint,
      recipient,
      false,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    log(`💰 Sending ${amountNumber} (${Number(amount) / Math.pow(10, decimals)} tokens) of ${tokenMint} to ${recipientWallet}`);

    const transaction = new Transaction();

    // Check if recipient token account exists, create if not
    try {
      await getAccount(connection, recipientTokenAccount, "confirmed", tokenProgramId);
      log(`✅ Recipient token account exists: ${recipientTokenAccount.toBase58()}`);
    } catch (err) {
      log(`⚠️ Creating recipient token account: ${recipientTokenAccount.toBase58()}`);
      transaction.add(
        createAssociatedTokenAccountInstruction(
          treasuryKeypair.publicKey,
          recipientTokenAccount,
          recipient,
          mint,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    // Check treasury token balance
    try {
      const treasuryAccount = await getAccount(connection, treasuryTokenAccount, "confirmed", tokenProgramId);
      if (BigInt(treasuryAccount.amount) < amount) {
        return {
          success: false,
          error: `Insufficient treasury token balance: ${treasuryAccount.amount.toString()} available, need ${amount.toString()}`
        };
      }
    } catch (err: any) {
      return { success: false, error: `Treasury token account not found or inaccessible: ${err.message}` };
    }

    // Add transfer instruction
    transaction.add(
      createTransferCheckedInstruction(
        treasuryTokenAccount,
        mint,
        recipientTokenAccount,
        treasuryKeypair.publicKey,
        amount,
        decimals,
        [],
        tokenProgramId
      )
    );

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [treasuryKeypair],
      { commitment: "confirmed" }
    );

    log(`✅ Referral payout successful: ${signature}`);
    return { success: true, signature };
  } catch (err: any) {
    log(`❌ Referral payout failed:`, err.message);
    return { success: false, error: err.message };
  }
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
function derivePoolTokenAddress(mint: PublicKey, pool: PublicKey, tokenProgramId: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, pool, true, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
}

// Mock randomness removed - always use real Switchboard randomness

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
  log(`pool=${poolAddress.slice(0, 8)} action=UNLOCK Starting...`);

  // PREVENTIVE: Check if already unlocked
  const poolData = await fetchPoolStateOnChain(poolAddress);
  const status = getPoolStatusString(poolData.status);

  if (status === "Unlocked" || status === "RandomnessCommitted" || status === "RandomnessRevealed" || status === "WinnerSelected" || status === "Ended") {
    log(`pool=${poolAddress.slice(0, 8)} action=UNLOCK reason=SKIP_ALREADY_${status}`);
    return;
  }

  // Track cost of unlock transaction
  await trackTransactionCost(poolAddress, 'unlock', async () => {
    const conn = getConnection();
    const poolPk = new PublicKey(poolAddress);
    const userPk = getDevWallet().publicKey;
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
  });
}

/**
 * Request randomness on-chain
 * MOCK MODE: Skips Switchboard and passes SystemProgram as sentinel
 * REAL MODE: Creates Switchboard Randomness Account, commits, and calls request_randomness instruction
 */
export async function requestRandomnessOnChain(poolAddress: string): Promise<void> {
  log(`pool=${poolAddress.slice(0, 8)} action=REQUEST_RANDOMNESS Starting...`);

  await trackTransactionCost(poolAddress, 'randomness', async () => {
    const conn = getConnection();
    const poolPk = new PublicKey(poolAddress);
    const userPk = getDevWallet().publicKey;
    const payer = getDevWallet();

  // PREVENTIVE: Check if already requested
  const poolData = await fetchPoolStateOnChain(poolAddress);
  const status = getPoolStatusString(poolData.status);

  if (status === "RandomnessCommitted" || status === "RandomnessRevealed" || status === "WinnerSelected" || status === "Ended") {
    log(`pool=${poolAddress.slice(0, 8)} action=REQUEST_RANDOMNESS reason=SKIP_ALREADY_${status}`);
    return;
  }

  // Always use real Switchboard randomness
  let randomnessAccount: PublicKey;

  if (false) {
    // This path is never taken anymore
    log(`pool=${poolAddress.slice(0, 8)} 🧪 MOCK MODE: Skipping Switchboard, using SystemProgram sentinel`);
    randomnessAccount = SystemProgram.programId;
  } else {
    // REAL MODE: Create Switchboard Randomness Account using proper mainnet queue
    const wallet = new Wallet(payer);
    
    log(`pool=${poolAddress.slice(0, 8)} Loading Switchboard queue for ${networkConfig.network}...`);
    
    // Use SDK's getDefaultQueue for proper mainnet/devnet selection
    let queue: Queue;
    if (networkConfig.network === "devnet") {
      queue = await getDefaultDevnetQueue(conn.rpcEndpoint);
      log(`pool=${poolAddress.slice(0, 8)} Using DEVNET Switchboard queue`);
    } else {
      queue = await getDefaultQueue(conn.rpcEndpoint);
      log(`pool=${poolAddress.slice(0, 8)} Using MAINNET Switchboard queue: ${queue.pubkey.toBase58().slice(0, 16)}...`);
    }
    
    // Get the program from the queue (this ensures correct mainnet/devnet program)
    const sbProgram = queue.program;
    log(`pool=${poolAddress.slice(0, 8)} Switchboard program ID: ${sbProgram.programId.toBase58()}`);

    const rngKeypair = Keypair.generate();
    log(`pool=${poolAddress.slice(0, 8)} Creating Switchboard randomness account: ${rngKeypair.publicKey.toBase58().slice(0, 8)}...`);

    const [rngObj, createIx] = await Randomness.create(sbProgram, rngKeypair, queue.pubkey, payer.publicKey);

    log(`pool=${poolAddress.slice(0, 8)} rngObj created, pubkey: ${rngObj.pubkey.toBase58().slice(0, 8)}`);

    try {
      const { Transaction } = await import("@solana/web3.js");

      // Transaction 1: CREATE randomness account
      const tx1 = new Transaction();
      const bh1 = await conn.getLatestBlockhash();
      tx1.recentBlockhash = bh1.blockhash;
      tx1.feePayer = userPk;
      tx1.add(createIx);
      tx1.sign(rngKeypair, payer);

      const sig1 = await conn.sendRawTransaction(tx1.serialize());
      log(`pool=${poolAddress.slice(0, 8)} action=SB_CREATE ✅ TX_SENT=${sig1.slice(0, 16)}`);
      await conn.confirmTransaction(sig1, "confirmed");
      log(`pool=${poolAddress.slice(0, 8)} action=SB_CREATE ✅ TX_CONFIRMED=${sig1.slice(0, 16)}`);

      // Step 2: NOW create commitIx (account exists now)
      log(`pool=${poolAddress.slice(0, 8)} Creating commitIx...`);
      const commitIx = await rngObj.commitIx(queue.pubkey);

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
    log(`pool=${poolAddress.slice(0, 8)} action=REQUEST_RANDOMNESS ✅ TX_CONFIRMED=${sig.slice(0, 16)} mode=REAL rng=${randomnessAccount.toBase58().slice(0, 16)}`);
  } catch (err: any) {
    log(`pool=${poolAddress.slice(0, 8)} action=REQUEST_RANDOMNESS ❌ FAILED: ${err.message}`);
    throw err;
  }
  });
}

/**
 * Reveal randomness on Switchboard
 * MOCK MODE: Skips reveal (instant winner selection)
 * REAL MODE: Calls revealIx() on the Switchboard randomness account
 */
export async function revealRandomnessOnChain(poolAddress: string): Promise<void> {
  log(`pool=${poolAddress.slice(0, 8)} action=REVEAL_RANDOMNESS Starting...`);

  // Get pool data to find randomness account
  const poolData = await fetchPoolStateOnChain(poolAddress);
  const status = getPoolStatusString(poolData.status);

  if (status !== "RandomnessCommitted") {
    log(`pool=${poolAddress.slice(0, 8)} action=REVEAL_RANDOMNESS reason=SKIP_WRONG_STATUS status=${status}`);
    return;
  }

  await trackTransactionCost(poolAddress, 'reveal', async () => {
    const conn = getConnection();
    const payer = getDevWallet();

  const randomnessAccount = poolData.randomnessAccount;
  if (!randomnessAccount) {
    throw new Error("Pool has no randomness_account");
  }

  // Always use real Switchboard randomness (no mock mode)

  // Load Switchboard program using getDefaultQueue for proper mainnet/devnet selection
  const wallet = new Wallet(payer);
  log(`pool=${poolAddress.slice(0, 8)} Loading Switchboard program for reveal (${networkConfig.network})...`);
  
  let queue: Queue;
  if (networkConfig.network === "devnet") {
    queue = await getDefaultDevnetQueue(conn.rpcEndpoint);
  } else {
    queue = await getDefaultQueue(conn.rpcEndpoint);
  }
  const sbProgram = queue.program;
  log(`pool=${poolAddress.slice(0, 8)} Switchboard program ID for reveal: ${sbProgram.programId.toBase58()}`);

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

    // Create reveal instruction with payer
    const revealIx = await rng.revealIx(payer.publicKey);

    // FIX: Switchboard SDK marks System Program as signer (which is invalid)
    // System Program (11111111111111111111111111111111) cannot sign
    const { SystemProgram } = await import("@solana/web3.js");
    revealIx.keys.forEach((key) => {
      if (key.pubkey.toBase58() === SystemProgram.programId.toBase58() && key.isSigner) {
        key.isSigner = false;
        log(`pool=${poolAddress.slice(0, 8)} Fixed System Program isSigner: true->false`);
      }
      // Ensure payer is marked as signer
      if (key.pubkey.toBase58() === payer.publicKey.toBase58() && !key.isSigner) {
        key.isSigner = true;
        log(`pool=${poolAddress.slice(0, 8)} Fixed payer isSigner: false->true`);
      }
    });

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
  });
}

/**
 * Select winner on-chain
 * MOCK MODE: Uses SystemProgram sentinel for instant winner selection
 * REAL MODE: Uses Switchboard randomness account
 */
export async function selectWinnerOnChain(poolAddress: string): Promise<void> {
  log(`pool=${poolAddress.slice(0, 8)} action=SELECT_WINNER Starting...`);

  // PREVENTIVE: Check if already selected
  const poolData = await fetchPoolStateOnChain(poolAddress);
  const status = getPoolStatusString(poolData.status);

  if (status === "WinnerSelected" || status === "Ended") {
    log(`pool=${poolAddress.slice(0, 8)} action=SELECT_WINNER reason=SKIP_ALREADY_${status}`);
    return;
  }

  await trackTransactionCost(poolAddress, 'selectWinner', async () => {
    const conn = getConnection();
    const poolPk = new PublicKey(poolAddress);
    const userPk = getDevWallet().publicKey;

  const randomnessAccount = poolData.randomnessAccount;
  if (!randomnessAccount) {
    throw new Error("Pool has no randomness_account field");
  }

  // Always use real Switchboard randomness
  const randomnessForInstruction = randomnessAccount;


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
  });
}

/**
 * Ensure a token account exists, creating it if necessary
 * @returns true if account was created, false if it already existed
 */
async function ensureTokenAccountExists(
  mint: PublicKey,
  owner: PublicKey,
  payer: Keypair,
  tokenProgramId: PublicKey
): Promise<boolean> {
  const conn = getConnection();
  const ata = getAssociatedTokenAddressSync(mint, owner, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);

  // Check if account exists
  const accountInfo = await conn.getAccountInfo(ata);
  if (accountInfo) {
    log(`Token account ${ata.toBase58().slice(0, 8)}... already exists for ${owner.toBase58().slice(0, 8)}...`);
    return false;
  }

  log(`Creating token account ${ata.toBase58().slice(0, 8)}... for ${owner.toBase58().slice(0, 8)}...`);

  // Create the account
  const ix = createAssociatedTokenAccountInstruction(
    payer.publicKey,  // payer
    ata,              // ata
    owner,            // owner
    mint,             // mint
    tokenProgramId,   // token program
    ASSOCIATED_TOKEN_PROGRAM_ID  // ata program
  );

  const tx = new Transaction();
  const bh = await conn.getLatestBlockhash();
  tx.recentBlockhash = bh.blockhash;
  tx.feePayer = payer.publicKey;
  tx.add(ix);
  tx.sign(payer);

  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");

  log(`✅ Token account created: ${ata.toBase58().slice(0, 8)}... TX: ${sig.slice(0, 16)}`);
  return true;
}

/**
 * Payout winner on-chain
 * Uses payout_winner instruction with all required accounts
 */
export async function payoutWinnerOnChain(poolAddress: string, realWinnerWallet?: string): Promise<void> {
  log(`pool=${poolAddress.slice(0, 8)} action=PAYOUT Starting...`);

  // PREVENTIVE: Check if already paid out
  const poolData = await fetchPoolStateOnChain(poolAddress);
  const status = getPoolStatusString(poolData.status);

  if (status === "Ended") {
    log(`pool=${poolAddress.slice(0, 8)} action=PAYOUT reason=SKIP_ALREADY_ENDED`);
    return;
  }

  await trackTransactionCost(poolAddress, 'payout', async () => {
    const conn = getConnection();
    const poolPk = new PublicKey(poolAddress);
    const userPk = getDevWallet().publicKey;

  const [participantsPda] = deriveParticipantsPda(poolPk);
  const tokenProgramId = await resolveTokenProgramForMint(conn, poolData.mint);

  const poolToken = derivePoolTokenAddress(poolData.mint, poolPk, tokenProgramId);

  const winnerToken = getAssociatedTokenAddressSync(poolData.mint, poolData.winner, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  const devToken = getAssociatedTokenAddressSync(poolData.mint, poolData.devWallet, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
  // CRITICAL: Use pool's treasury_wallet from on-chain state, not from ENV
  const treasuryToken = getAssociatedTokenAddressSync(poolData.mint, poolData.treasuryWallet, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);

  // Ensure required token accounts exist (dev and treasury might not have accounts for this mint)
  log(`pool=${poolAddress.slice(0, 8)} Ensuring token accounts exist...`);
  await ensureTokenAccountExists(poolData.mint, poolData.devWallet, getDevWallet(), tokenProgramId);
  await ensureTokenAccountExists(poolData.mint, poolData.treasuryWallet, getDevWallet(), tokenProgramId);
  await ensureTokenAccountExists(poolData.mint, poolData.winner, getDevWallet(), tokenProgramId);

  // payout_winner discriminator: [192, 241, 157, 158, 130, 150, 10, 8]
  const ix = createInstructionWithDiscriminator(
    [192, 241, 157, 158, 130, 150, 10, 8],
    Buffer.alloc(0),
    [
      { pubkey: poolData.mint, isSigner: false, isWritable: true },            // 0: mint
      { pubkey: poolPk, isSigner: false, isWritable: true },                   // 1: pool
      { pubkey: poolToken, isSigner: false, isWritable: true },                // 2: pool_token
      { pubkey: winnerToken, isSigner: false, isWritable: true },              // 3: winner_token
      { pubkey: devToken, isSigner: false, isWritable: true },                 // 4: dev_token
      { pubkey: treasuryToken, isSigner: false, isWritable: true },            // 5: treasury_token
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },          // 6: token_program
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 7: associated_token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 8: system_program
      { pubkey: poolData.winner, isSigner: false, isWritable: false },         // 9: winner_pubkey
      { pubkey: userPk, isSigner: true, isWritable: true },                    // 10: user
      { pubkey: participantsPda, isSigner: false, isWritable: true },          // 11: participants
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

    // 🆓 FREE POOLS: Transfer from auxiliary wallet to real winner
    if (realWinnerWallet && realWinnerWallet.toLowerCase() !== poolData.winner.toBase58().toLowerCase()) {
      log(`pool=${poolAddress.slice(0, 8)} 🆓 FREE pool - transferring from auxiliary ${poolData.winner.toBase58().slice(0, 8)} to real winner ${realWinnerWallet.slice(0, 8)}`);

      try {
        // Get pool ID from database to lookup auxiliary wallet index
        const { storage } = await import("../storage");
        const { db } = await import("../db");
        const { pools } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");

        const [poolRecord] = await db.select().from(pools).where(eq(pools.poolAddress, poolAddress)).limit(1);
        if (!poolRecord) {
          log(`pool=${poolAddress.slice(0, 8)} ❌ Could not find pool in database`);
          throw new Error("Pool not found in database");
        }

        // Lookup auxiliary wallet index from sponsored_participants table
        const sponsoredParticipants = await storage.getSponsoredParticipantsForPool(poolRecord.id);
        const auxiliaryParticipant = sponsoredParticipants.find(
          sp => sp.auxiliaryWallet.toLowerCase() === poolData.winner.toBase58().toLowerCase()
        );

        if (!auxiliaryParticipant) {
          log(`pool=${poolAddress.slice(0, 8)} ❌ Could not find auxiliary wallet mapping for ${poolData.winner.toBase58().slice(0, 8)}`);
          throw new Error("Auxiliary wallet mapping not found");
        }

        const auxiliaryKeypair = getAuxiliaryWallet(auxiliaryParticipant.auxiliaryIndex);
        if (!auxiliaryKeypair) {
          log(`pool=${poolAddress.slice(0, 8)} ❌ Could not load auxiliary wallet keypair at index ${auxiliaryParticipant.auxiliaryIndex}`);
          throw new Error("Auxiliary wallet keypair not found");
        }

        // Get auxiliary wallet's token account balance
        const auxiliaryTokenAccount = getAssociatedTokenAddressSync(
          poolData.mint,
          poolData.winner,
          false,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const auxiliaryBalance = await conn.getTokenAccountBalance(auxiliaryTokenAccount);
        const transferAmount = BigInt(auxiliaryBalance.value.amount);

        log(`pool=${poolAddress.slice(0, 8)} 💰 Transferring ${transferAmount} tokens to real winner`);

        // Create real winner's token account if needed
        const realWinnerPubkey = new PublicKey(realWinnerWallet);
        await ensureTokenAccountExists(poolData.mint, realWinnerPubkey, getDevWallet(), tokenProgramId);

        const realWinnerTokenAccount = getAssociatedTokenAddressSync(
          poolData.mint,
          realWinnerPubkey,
          false,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        // Create transfer instruction
        const { createTransferInstruction } = await import("@solana/spl-token");
        const transferIx = createTransferInstruction(
          auxiliaryTokenAccount,
          realWinnerTokenAccount,
          auxiliaryKeypair.publicKey,
          transferAmount,
          [],
          tokenProgramId
        );

        const transferTx = new Transaction();
        const transferBh = await conn.getLatestBlockhash();
        transferTx.recentBlockhash = transferBh.blockhash;
        transferTx.feePayer = getDevWallet().publicKey; // Dev wallet pays gas fee
        transferTx.add(transferIx);

        // Sign with both: dev wallet for fee, auxiliary for transfer authority
        transferTx.sign(getDevWallet(), auxiliaryKeypair);

        const transferSig = await conn.sendRawTransaction(transferTx.serialize());
        await conn.confirmTransaction(transferSig, "confirmed");

        log(`pool=${poolAddress.slice(0, 8)} ✅ Transfer to real winner confirmed: ${transferSig.slice(0, 16)}`);
      } catch (transferErr: any) {
        log(`pool=${poolAddress.slice(0, 8)} ❌ Failed to transfer to real winner: ${transferErr.message}`);
        // Don't throw - payout already succeeded, transfer failure is secondary
      }
    }
  } catch (err: any) {
    log(`pool=${poolAddress.slice(0, 8)} action=PAYOUT ❌ FAILED: ${err.message}`);
    throw err;
  }
  });
}

/**
 * Check if pool is empty and eligible for rent claim
 * Returns true ONLY if:
 * 1. pool_token.amount == 0
 * 2. participants.count == 0
 */
export async function isPoolEmptyForRentClaim(poolAddress: string): Promise<boolean> {
  try {
    const prog = getProgram();
    const conn = getConnection();
    const poolPk = new PublicKey(poolAddress);

    log(`pool=${poolAddress.slice(0, 8)} Checking rent eligibility...`);

    // Fetch pool state
    const poolData = await (prog.account as any).pool.fetch(poolPk, "confirmed");

    // Derive participants PDA
    const [participantsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("participants"), poolPk.toBuffer()],
      PROGRAM_ID
    );

    // Fetch participants state
    let participantsData;
    try {
      participantsData = await (prog.account as any).participants.fetch(participantsPda, "confirmed");
    } catch (err: any) {
      // Participants account might be closed if rent already claimed
      if (err.message?.includes("Account does not exist") || err.message?.includes("Invalid account data")) {
        log(`pool=${poolAddress.slice(0, 8)} Participants account does not exist (might be closed)`);
        return false; // Can't claim rent if accounts are closed
      }
      throw err;
    }

    // Derive pool_token PDA
    const mintPk = poolData.mint;
    const tokenProgramId = await resolveTokenProgramForMint(conn, mintPk);
    const poolTokenPda = getAssociatedTokenAddressSync(
      mintPk,
      poolPk,
      true,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Fetch pool_token account
    const { getAccount } = await import("@solana/spl-token");
    let poolTokenAccount;
    try {
      poolTokenAccount = await getAccount(conn, poolTokenPda, undefined, tokenProgramId);
    } catch (err: any) {
      // Pool token account might be closed after claim_rent
      if (err.message?.includes("Account does not exist") || err.message?.includes("Invalid account owner")) {
        log(`pool=${poolAddress.slice(0, 8)} Pool token account does not exist (already claimed rent)`);
        return false; // Already claimed
      }
      throw err;
    }

    // Check pool status - must be cancelled to claim rent
    const isCancelled = poolData.status?.cancelled !== undefined;

    // For rent claim: pool must be cancelled AND all tokens refunded (pool_token.amount == 0)
    // participants.count does NOT need to be 0 because participants may not have claimed yet
    const canClaimRent = isCancelled && poolTokenAccount.amount === BigInt(0);

    log(`pool=${poolAddress.slice(0, 8)} canClaimRent=${canClaimRent} isCancelled=${isCancelled} tokenAmount=${poolTokenAccount.amount.toString()} participantsCount=${participantsData.count}`);

    return canClaimRent;
  } catch (err: any) {
    log(`pool=${poolAddress.slice(0, 8)} ❌ Error checking if empty: ${err.message}`);
    return false;
  }
}

/**
 * Check if a wallet is in the on-chain participants list for refund eligibility
 */
export async function isWalletInParticipantsList(poolAddress: string, walletAddress: string): Promise<boolean> {
  try {
    const prog = getProgram();
    const poolPk = new PublicKey(poolAddress);
    const walletPk = new PublicKey(walletAddress);

    log(`pool=${poolAddress.slice(0, 8)} wallet=${walletAddress.slice(0, 8)} Checking if wallet is in participants list...`);

    // Derive participants PDA
    const [participantsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("participants"), poolPk.toBuffer()],
      PROGRAM_ID
    );

    // Fetch participants state
    let participantsData;
    try {
      participantsData = await (prog.account as any).participants.fetch(participantsPda, "confirmed");
    } catch (err: any) {
      // Participants account might be closed or doesn't exist
      if (err.message?.includes("Account does not exist") || err.message?.includes("Invalid account data")) {
        log(`pool=${poolAddress.slice(0, 8)} wallet=${walletAddress.slice(0, 8)} Participants account does not exist`);
        return false;
      }
      throw err;
    }

    // Debug: Log the entire participants data structure to see field names
    log(`pool=${poolAddress.slice(0, 8)} wallet=${walletAddress.slice(0, 8)} participantsData keys: ${Object.keys(participantsData).join(', ')}`);
    log(`pool=${poolAddress.slice(0, 8)} wallet=${walletAddress.slice(0, 8)} participantsData: ${JSON.stringify(participantsData, null, 2)}`);

    // Check if wallet is in the participants list
    // The field name might be 'wallets', 'participants', or something else
    const wallets = participantsData.wallets || participantsData.participants || participantsData.list || [];
    const count = participantsData.count || 0;

    // Debug: Log the participants data structure
    log(`pool=${poolAddress.slice(0, 8)} wallet=${walletAddress.slice(0, 8)} Participants count: ${count}, Wallets array length: ${wallets.length}`);
    log(`pool=${poolAddress.slice(0, 8)} wallet=${walletAddress.slice(0, 8)} Looking for wallet: ${walletPk.toBase58()}`);

    // Check if wallet is in the list (compare first 'count' wallets)
    for (let i = 0; i < count && i < wallets.length; i++) {
      const participantPk = wallets[i];
      const participantStr = participantPk.toBase58();
      log(`pool=${poolAddress.slice(0, 8)} wallet=${walletAddress.slice(0, 8)} Checking index ${i}: ${participantStr}`);

      if (participantStr === walletPk.toBase58()) {
        log(`pool=${poolAddress.slice(0, 8)} wallet=${walletAddress.slice(0, 8)} ✅ Found in participants list at index ${i}`);
        return true;
      }
    }

    log(`pool=${poolAddress.slice(0, 8)} wallet=${walletAddress.slice(0, 8)} ❌ NOT in participants list (count: ${count})`);
    return false;
  } catch (err: any) {
    log(`pool=${poolAddress.slice(0, 8)} wallet=${walletAddress.slice(0, 8)} ❌ Error checking participants list: ${err.message}`);
    return false;
  }
}

/**
 * Get on-chain state for rent eligibility check
 */
export async function getPoolRentEligibility(poolAddress: string): Promise<{
  isEligible: boolean;
  poolTokenAmount: string;
  participantsCount: number;
  error?: string;
}> {
  try {
    const prog = getProgram();
    const conn = getConnection();
    const poolPk = new PublicKey(poolAddress);

    // Fetch pool state
    const poolData = await (prog.account as any).pool.fetch(poolPk, "confirmed");

    // Derive participants PDA
    const [participantsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("participants"), poolPk.toBuffer()],
      PROGRAM_ID
    );

    // Fetch participants state
    const participantsData = await (prog.account as any).participants.fetch(participantsPda, "confirmed");

    // Derive pool_token PDA
    const mintPk = poolData.mint;
    const tokenProgramId = await resolveTokenProgramForMint(conn, mintPk);
    const poolTokenPda = getAssociatedTokenAddressSync(
      mintPk,
      poolPk,
      true,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Fetch pool_token account
    const { getAccount } = await import("@solana/spl-token");
    const poolTokenAccount = await getAccount(conn, poolTokenPda, undefined, tokenProgramId);

    const isEligible = poolTokenAccount.amount === BigInt(0) && participantsData.count === 0;

    return {
      isEligible,
      poolTokenAmount: poolTokenAccount.amount.toString(),
      participantsCount: participantsData.count,
    };
  } catch (err: any) {
    log(`pool=${poolAddress.slice(0, 8)} ❌ Error getting rent eligibility: ${err.message}`);
    return {
      isEligible: false,
      poolTokenAmount: "0",
      participantsCount: 0,
      error: err.message,
    };
  }
}

// ============================================
// SPONSORED/FREE POOLS SUPPORT
// ============================================

/**
 * Get an available auxiliary wallet for free pool join
 * @param auxiliaryIndex - Index of the auxiliary wallet (0-8)
 * @returns Keypair of the auxiliary wallet
 */
export function getAuxiliaryWallet(auxiliaryIndex: number): Keypair | null {
  if (auxiliaryIndex < 0 || auxiliaryIndex >= auxiliaryWallets.length) {
    log(`❌ Invalid auxiliary wallet index: ${auxiliaryIndex}`);
    return null;
  }
  return auxiliaryWallets[auxiliaryIndex];
}

/**
 * Get total number of loaded auxiliary wallets
 */
export function getAuxiliaryWalletCount(): number {
  return auxiliaryWallets.length;
}

/**
 * Check if sponsored pools are enabled (auxiliary wallets loaded)
 */
export function isSponsoredPoolsEnabled(): boolean {
  return auxiliaryWallets.length > 0;
}

