import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, Connection, VersionedTransaction, TransactionMessage, ComputeBudgetProgram } from "@solana/web3.js";
import { WalletContextState } from "@solana/wallet-adapter-react";

import { getConnection, initConnection, getConnectionInfo } from "./connection";
import { PROGRAM_ID } from "./programs/program-id";
import { deriveParticipantsPda } from "./pda/derive";
import { IDL } from "./idl";

export interface PoolState {
  version: number;
  bump: number;
  poolId: anchor.BN;
  salt: Uint8Array; // [u8; 32]
  creator: PublicKey;
  mint: PublicKey;
  amount: anchor.BN;
  maxParticipants: number;
  startTime: anchor.BN; // i64
  duration: anchor.BN; // i64
  expireTime: anchor.BN; // i64
  lockDuration: anchor.BN;
  lockStartTime: anchor.BN;
  endTime: anchor.BN; // i64
  unlockTime: anchor.BN; // i64
  devWallet: PublicKey;
  devFeeBps: number;
  burnFeeBps: number;
  treasuryWallet: PublicKey;
  treasuryFeeBps: number;
  participantsAccount: PublicKey;
  status: any;
  winner: PublicKey;
  randomnessAccount: PublicKey;
  allowMock: boolean;
  closeTime: anchor.BN;
  totalAmount: anchor.BN; // u64
  totalVolume: anchor.BN; // u64
  totalJoins: number; // u32
  totalDonations: number; // u32
  randomness: anchor.BN; // u128
  randomnessDeadlineSlot: anchor.BN; // u64
  paused: boolean;
  schema: number; // u8
  configHash: Uint8Array; // [u8; 32]
  randomnessCommitSlot: anchor.BN; // u64
  initialized: boolean;
  lastJoinTime: anchor.BN; // i64
  statusReason: number; // u8
}

export interface ParticipantsState {
  count: number;
  list: PublicKey[]; // Filtered from fixed array [Pubkey; 20], removing default pubkeys
}

export class MissoutClient {
  private connection: Connection;
  private wallet: WalletContextState | null = null;
  private program: any = null;

  constructor() {
    this.connection = getConnection();
    // Start async initialization
    initConnection().catch(console.error);
  }

  setWallet(wallet: WalletContextState) {
    this.wallet = wallet;

    // Initialize Anchor Program when wallet is connected
    if (wallet.publicKey && wallet.signTransaction) {
      try {
        const provider = new AnchorProvider(
          this.connection,
          wallet as any,
          { commitment: "confirmed" }
        );
        this.program = new Program(IDL, provider);
        console.log("[MissoutClient] Anchor Program initialized");
      } catch (err) {
        console.error("[MissoutClient] Failed to initialize Anchor Program:", err);
      }
    }
  }

  getConnection() {
    return this.connection;
  }

  getConnectionInfo() {
    return getConnectionInfo();
  }

  getWallet() {
    return this.wallet;
  }

  isReady(): boolean {
    return this.wallet !== null && this.wallet.connected && this.wallet.publicKey !== null;
  }

  async getPoolState(poolId: string): Promise<PoolState | null> {
    try {
      const pubkey = new PublicKey(poolId);

      // Use Anchor Program if available
      if (this.program && this.program.account && (this.program.account as any).pool) {
        try {
          // Note: Anchor converts PascalCase account names to camelCase
          // Use "confirmed" commitment to match transaction confirmation level
          const poolData = await (this.program.account as any).pool.fetch(pubkey, "confirmed");
          console.log("[MissoutClient] Successfully fetched pool via Anchor:", pubkey.toBase58());
          return poolData as PoolState;
        } catch (anchorErr) {
          console.error("[MissoutClient] Anchor fetch failed, falling back to manual parsing:", anchorErr);
        }
      }

      // Fallback: manual parsing for read-only without wallet
      const acc = await this.connection.getAccountInfo(pubkey, "confirmed");
      if (!acc) return null;
      if (!acc.owner.equals(PROGRAM_ID)) {
        console.warn(`[MissoutClient] Account ${poolId} is not owned by program`);
        return null;
      }

      console.warn("[MissoutClient] Using manual buffer parsing - Anchor Program not available");
      const dataView = new DataView(acc.data.buffer, acc.data.byteOffset, acc.data.byteLength);
      return this.decodePoolFromBuffer(dataView, acc.data);
    } catch (err) {
      console.error("getPoolState error:", err);
      return null;
    }
  }

  private decodePoolFromBuffer(dataView: DataView, data: Uint8Array): PoolState {
    // Manual buffer parsing matching NEW Pool structure from IDL
    // Based on field order at idl.ts lines 1744-1912
    console.log("[decodePoolFromBuffer] Parsing account, data length:", data.length);

    let offset = 8; // Skip discriminator

    // Parse fields in IDL order:
    const poolId = new anchor.BN(data.slice(offset, offset + 8), 'le'); offset += 8;
    const salt = data.slice(offset, offset + 32); offset += 32;
    const mint = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
    console.log("[decodePoolFromBuffer] Parsed mint:", mint.toBase58());

    const creator = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
    const startTime = new anchor.BN(data.slice(offset, offset + 8), 'le'); offset += 8;
    const duration = new anchor.BN(data.slice(offset, offset + 8), 'le'); offset += 8;
    const expireTime = new anchor.BN(data.slice(offset, offset + 8), 'le'); offset += 8;
    const endTime = new anchor.BN(data.slice(offset, offset + 8), 'le'); offset += 8;
    const unlockTime = new anchor.BN(data.slice(offset, offset + 8), 'le'); offset += 8;
    const closeTime = new anchor.BN(data.slice(offset, offset + 8), 'le'); offset += 8;
    const maxParticipants = data[offset++];
    const lockDuration = new anchor.BN(data.slice(offset, offset + 8), 'le'); offset += 8;
    const lockStartTime = new anchor.BN(data.slice(offset, offset + 8), 'le'); offset += 8;
    const amount = new anchor.BN(data.slice(offset, offset + 8), 'le'); offset += 8;
    const totalAmount = new anchor.BN(data.slice(offset, offset + 8), 'le'); offset += 8;
    const totalVolume = new anchor.BN(data.slice(offset, offset + 8), 'le'); offset += 8;
    const totalJoins = dataView.getUint32(offset, true); offset += 4;
    const totalDonations = dataView.getUint32(offset, true); offset += 4;
    const devWallet = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
    const devFeeBps = dataView.getUint16(offset, true); offset += 2;
    const burnFeeBps = dataView.getUint16(offset, true); offset += 2;
    const treasuryWallet = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
    const treasuryFeeBps = dataView.getUint16(offset, true); offset += 2;
    const randomness = new anchor.BN(data.slice(offset, offset + 16), 'le'); offset += 16;
    const randomnessAccount = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
    const randomnessDeadlineSlot = new anchor.BN(data.slice(offset, offset + 8), 'le'); offset += 8;
    const bump = data[offset++];
    const statusByte = data[offset++];
    const status = this.decodeStatus(statusByte);
    const paused = data[offset++] === 1;
    const version = data[offset++];
    const schema = data[offset++];
    const configHash = data.slice(offset, offset + 32); offset += 32;
    const allowMock = data[offset++] === 1;
    const randomnessCommitSlot = new anchor.BN(data.slice(offset, offset + 8), 'le'); offset += 8;
    const initialized = data[offset++] === 1;
    const lastJoinTime = new anchor.BN(data.slice(offset, offset + 8), 'le'); offset += 8;
    const statusReason = data[offset++];
    const participantsAccount = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
    const winner = new PublicKey(data.slice(offset, offset + 32)); offset += 32;

    console.log("[decodePoolFromBuffer] Parsing complete, final offset:", offset);

    return {
      poolId, salt, mint, creator, startTime, duration, expireTime, endTime,
      unlockTime, closeTime, maxParticipants, lockDuration, lockStartTime,
      amount, totalAmount, totalVolume, totalJoins, totalDonations,
      devWallet, devFeeBps, burnFeeBps, treasuryWallet, treasuryFeeBps,
      randomness, randomnessAccount, randomnessDeadlineSlot, bump, status,
      paused, version, schema, configHash, allowMock, randomnessCommitSlot,
      initialized, lastJoinTime, statusReason, participantsAccount, winner
    };
  }

  private decodeStatus(statusByte: number): any {
    const statuses = ['open', 'locked', 'unlocked', 'randomnessRequested', 'winnerSelected', 'ended', 'cancelled', 'paused'];
    const name = statuses[statusByte] || 'unknown';
    return { [name]: {} };
  }

  async getParticipantsState(poolId: string): Promise<ParticipantsState | null> {
    try {
      const poolPk = new PublicKey(poolId);
      const [participantsPda] = deriveParticipantsPda(poolPk);

      // Use Anchor Program if available
      if (this.program) {
        try {
          const participantsData = await this.program.account.Participants.fetch(participantsPda);
          // Filter out default pubkeys from fixed array [Pubkey; 20]
          const defaultPubkey = PublicKey.default.toBase58();
          const filteredList = participantsData.list.filter(
            (pk: PublicKey) => pk.toBase58() !== defaultPubkey
          );
          return {
            count: participantsData.count,
            list: filteredList,
          };
        } catch (anchorErr) {
          console.error("[MissoutClient] Anchor fetch failed for Participants, falling back:", anchorErr);
        }
      }

      // Fallback: manual parsing
      const acc = await this.connection.getAccountInfo(participantsPda);
      if (!acc) return null;

      console.warn("[MissoutClient] Using legacy Participants parsing - Anchor Program not available");
      return this.decodeParticipantsFromBuffer(acc.data);
    } catch (err) {
      console.error("getParticipantsState error:", err);
      return null;
    }
  }

  private decodeParticipantsFromBuffer(data: Uint8Array): ParticipantsState {
    // LEGACY: This method provides backward compatibility when Anchor Program is not available
    // NOTE: This parsing is based on the OLD Participants structure (Vec<Pubkey>)
    // The NEW IDL uses a fixed array [Pubkey; 20] - use Anchor Program for accurate parsing

    const MIN_PARTICIPANTS_SIZE = 8 + 32 + 2 + 4;
    if (data.length < MIN_PARTICIPANTS_SIZE) {
      throw new Error(`Participants account too short: ${data.length} < ${MIN_PARTICIPANTS_SIZE}`);
    }

    let offset = 8;
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);

    // Skip pool field (not in new interface)
    offset += 32;
    const count = dataView.getUint16(offset, true); offset += 2;

    const list: PublicKey[] = [];
    const vecLen = dataView.getUint32(offset, true); offset += 4;

    const expectedLen = offset + vecLen * 32;
    if (data.length < expectedLen) {
      console.warn(`Participants list truncated: expected ${expectedLen} bytes, got ${data.length}`);
    }

    for (let i = 0; i < vecLen && offset + 32 <= data.length; i++) {
      list.push(new PublicKey(data.slice(offset, offset + 32)));
      offset += 32;
    }

    return { count, list };
  }

  getPoolStatus(status: any): string {
    if (!status) return "unknown";
    const key = Object.keys(status)[0];
    return key.toLowerCase();
  }

  /**
   * RPC Health Check - verifies connection before transaction
   */
  async checkRpcHealth(): Promise<{ ok: boolean; error?: string }> {
    try {
      console.log("SDK_RPC_HEALTHCHECK: Checking...", this.connection.rpcEndpoint);
      const version = await this.connection.getVersion();
      console.log("SDK_RPC_HEALTHCHECK_OK: Solana version", version["solana-core"]);
      return { ok: true };
    } catch (err: any) {
      console.error("SDK_RPC_HEALTHCHECK_FAIL:", err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * ANCHOR-LEVEL POOL WARM-UP
   *
   * Wait for Anchor to successfully deserialize the Pool account.
   * This is NOT about RPC propagation - it's about Anchor's deserialization readiness.
   *
   * Why this is needed:
   * - Transaction confirms ✅
   * - getAccountInfo returns data ✅
   * - BUT program.account.pool.fetch() FAILS for 1-3 slots ❌
   *
   * This function polls Anchor's fetch() until it succeeds.
   * Only then is the pool ready for donate/cancel/join.
   */
  async waitForAnchorPool(
    poolPubkey: PublicKey,
    maxRetries = 15,
    delayMs = 1000
  ): Promise<boolean> {
    console.log(`[waitForAnchorPool] Waiting for Anchor to deserialize pool: ${poolPubkey.toBase58()}`);

    if (!this.program || !this.program.account || !(this.program.account as any).pool) {
      console.error("[waitForAnchorPool] ❌ Anchor Program not initialized");
      return false;
    }

    for (let i = 0; i < maxRetries; i++) {
      try {
        // THE CRITICAL CHECK: Can Anchor deserialize the pool account?
        const poolData = await (this.program.account as any).pool.fetch(poolPubkey, "confirmed");

        if (poolData && poolData.initialized === true) {
          console.log(`[waitForAnchorPool] ✅ Anchor can deserialize pool after ${i + 1} attempts`);
          console.log(`[waitForAnchorPool] Pool status: ${JSON.stringify(poolData.status)}`);
          return true;
        } else if (poolData) {
          console.warn(`[waitForAnchorPool] Pool fetched but initialized=${poolData.initialized}, retrying...`);
        }
      } catch (err: any) {
        // Expected errors during warm-up:
        // - "Account does not exist" (not yet visible)
        // - "Invalid account discriminator" (data not ready)
        const errMsg = err.message || String(err);
        console.log(`[waitForAnchorPool] Attempt ${i + 1}/${maxRetries}: ${errMsg.slice(0, 80)}`);
      }

      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    console.error(`[waitForAnchorPool] ❌ Timeout after ${maxRetries * delayMs / 1000}s - Anchor still cannot fetch pool`);
    return false;
  }

  /**
   * REMOVED: Reactive retry logic
   *
   * We no longer retry on AccountNotInitialized errors.
   * The preventive fix (waitForAnchorPool) ensures pool is ready BEFORE any operation.
   *
   * This method now just calls buildAndSendTransaction directly.
   */
  async buildAndSendTransactionWithRetry(
    instructions: anchor.web3.TransactionInstruction[],
    priorityFee = 5000
  ): Promise<string> {
    // No retry logic - pool must be ready before calling this
    return await this.buildAndSendTransaction(instructions, priorityFee);
  }

  async buildAndSendTransaction(
    instructions: anchor.web3.TransactionInstruction[],
    priorityFee = 5000
  ): Promise<string> {
    console.log("==============================================");
    console.log("=== BUILD_AND_SEND_TX_ENTER ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("RPC_ENDPOINT:", this.connection.rpcEndpoint);

    // Step 1: Wallet validation
    console.log("WALLET_STATE:", {
      hasWallet: !!this.wallet,
      hasPublicKey: !!this.wallet?.publicKey,
      publicKey: this.wallet?.publicKey?.toBase58() || "null",
      hasSignTransaction: typeof this.wallet?.signTransaction === 'function',
      hasSendTransaction: typeof this.wallet?.sendTransaction === 'function',
      connected: this.wallet?.connected,
    });

    if (!this.wallet?.publicKey) {
      console.error("SDK_ABORT: Wallet not connected (no publicKey)");
      throw new Error("Wallet not connected");
    }

    // Check for either sendTransaction OR signTransaction
    const canSend = typeof this.wallet.sendTransaction === 'function';
    const canSign = typeof this.wallet.signTransaction === 'function';

    if (!canSend && !canSign) {
      console.error("SDK_ABORT: Wallet cannot sign or send transactions");
      throw new Error("Wallet cannot sign transactions");
    }

    console.log("WALLET_READY:", this.wallet.publicKey.toBase58());
    console.log("=== WALLET_METHOD_USED ===", canSend ? "sendTransaction" : "signTransaction");

    // Step 2: RPC Health Check
    const healthCheck = await this.checkRpcHealth();
    if (!healthCheck.ok) {
      console.error("SDK_RPC_FAIL:", healthCheck.error);
      throw new Error(`RPC connection failed: ${healthCheck.error}`);
    }

    // Ensure we are on devnet
    if (this.connection.rpcEndpoint.includes('mainnet')) {
      throw new Error("CRITICAL: Mainnet RPC detected during transaction build");
    }

    // Step 3: Get blockhash
    console.log("FETCHING_BLOCKHASH...");
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("finalized");
    console.log("BLOCKHASH:", blockhash, "HEIGHT:", lastValidBlockHeight);

    // Step 4: Build transaction
    const ixs = [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }),
      ...instructions,
    ];

    console.log("BUILDING_TX_MESSAGE...");
    const message = new TransactionMessage({
      payerKey: this.wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: ixs,
    }).compileToV0Message();

    const tx = new VersionedTransaction(message);
    console.log("SDK_BUILD_TX_OK:", tx.message.recentBlockhash);

    // Step 5: Simulate transaction
    console.log("SDK_SIMULATING...");
    try {
      const simulation = await this.connection.simulateTransaction(tx, {
        commitment: 'confirmed',
        replaceRecentBlockhash: false
      });
      if (simulation.value.err) {
        const logs = simulation.value.logs ? simulation.value.logs.join("\n") : "No logs";
        const errorMsg = `Simulation failed: ${JSON.stringify(simulation.value.err)}\nLogs:\n${logs}`;
        console.error("SDK_SIMULATE_FAIL:", errorMsg);
        throw new Error(errorMsg);
      }
      console.log("SDK_SIMULATE_OK: Units consumed:", simulation.value.unitsConsumed);
    } catch (simErr: any) {
      console.error("SDK_SIMULATE_ERROR:", simErr.message);
      // If it's our thrown simulation error, re-throw it
      if (simErr.message.includes("Simulation failed")) {
        throw simErr;
      }
      // Otherwise warn and continue (fallback for unexpected RPC issues)
      console.warn("SDK_SIMULATE_WARN: Continuing despite simulation error...");
    }

    // Step 6: Send to wallet - THIS IS WHERE PHANTOM POPUP SHOULD APPEAR
    console.log("==============================================");
    console.log("==> SDK_SENDING_TO_WALLET <==");
    console.log("Phantom popup should appear NOW");
    console.log("==============================================");

    let sig: string;

    try {
      const sendOptions = {
        maxRetries: 5,
        skipPreflight: false,
      };

      if (canSend) {
        console.log("=== CALLING_WALLET_SEND_TX ===");
        sig = await this.wallet.sendTransaction(tx, this.connection, sendOptions);
        console.log("=== WALLET_RETURNED_SIG ===", sig);
      } else {
        console.log("=== CALLING_WALLET_SIGN_TX ===");
        const signedTx = await this.wallet.signTransaction!(tx);
        console.log("=== WALLET_SIGNED_OK ===");

        console.log("=== SENDING_RAW_TX ===");
        sig = await this.connection.sendRawTransaction(signedTx.serialize(), sendOptions);
        console.log("=== RAW_TX_SENT ===", sig);
      }
    } catch (walletErr: any) {
      console.error("=== WALLET_ERROR ===", walletErr.message);
      if (walletErr.message?.includes('User rejected') || walletErr.message?.includes('rejected')) {
        throw new Error("Transaction cancelled by user");
      }
      throw walletErr;
    }

    console.log("SDK_TX_SENT:", sig);
    console.log(`Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);

    // Step 7: Confirm and verify transaction success
    console.log("SDK_CONFIRMING...");
    try {
      const confirmation = await this.connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      // Final sanity check: get status to see if it actually succeeded
      const status = await this.connection.getSignatureStatus(sig, { searchTransactionHistory: true });
      if (status.value?.err) {
        // Fetch logs for better error reporting
        const txInfo = await this.connection.getTransaction(sig, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0
        });
        const logs = txInfo?.meta?.logMessages ? txInfo.meta.logMessages : [];
        const logsStr = logs.join(" | ");

        // Detect Anchor error 3012 (AccountNotInitialized)
        if (logsStr.includes("0xbc4") || logsStr.includes("3012")) {
          throw new Error("Your ATA for this mint is missing; create associated token account first.");
        }

        throw new Error(`On-chain failure: ${JSON.stringify(status.value.err)} | Logs: ${logsStr}`);
      }

      console.log("SDK_TX_CONFIRMED_SUCCESS:", sig);

      // Post-confirmation balance diff detection
      try {
        const txInfo = await this.connection.getTransaction(sig, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0
        });
        if (txInfo?.meta) {
          const preBalances = txInfo.meta.preTokenBalances || [];
          const postBalances = txInfo.meta.postTokenBalances || [];
          console.log("=== BALANCE_DIFF ===", { preBalances, postBalances });
          // We can store this in a global state or return it
        }
      } catch (e) {
        console.warn("Failed to fetch balance diffs", e);
      }
    } catch (confirmErr: any) {
      console.error("SDK_TX_FAILURE:", confirmErr.message);
      throw confirmErr;
    }

    console.log("=== BUILD_AND_SEND_TX_SUCCESS ===");
    console.log("==============================================");

    return sig;
  }
}

let clientInstance: MissoutClient | null = null;

export function getMissoutClient(): MissoutClient {
  if (!clientInstance) {
    clientInstance = new MissoutClient();
  }
  return clientInstance;
}
