import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";

export interface FaucetConfig {
  mintAddress: string;
  decimals: number;
  amountPerRequest: number;
  rpcUrl: string;
  authorityPrivateKey: string;
}

export interface FaucetRequest {
  walletAddress: string;
  requestIp?: string;
}

export interface FaucetResponse {
  success: boolean;
  signature?: string;
  amount?: number;
  message?: string;
  error?: string;
}

export class FaucetService {
  private connection: Connection;
  private authority: Keypair;
  private mintAddress: PublicKey;
  private config: FaucetConfig;

  constructor(config: FaucetConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.mintAddress = new PublicKey(config.mintAddress);

    // Initialize authority keypair from private key
    try {
      const secretKey = bs58.decode(config.authorityPrivateKey);
      this.authority = Keypair.fromSecretKey(secretKey);
      console.log("[Faucet] Initialized with authority:", this.authority.publicKey.toBase58());
    } catch (error) {
      console.error("[Faucet] Failed to initialize authority keypair:", error);
      throw new Error("Invalid authority private key");
    }
  }

  /**
   * Send HNCZ tokens to a wallet
   */
  async sendTokens(request: FaucetRequest): Promise<FaucetResponse> {
    const { walletAddress } = request;

    try {
      // Validate wallet address
      let recipientPubkey: PublicKey;
      try {
        recipientPubkey = new PublicKey(walletAddress);
      } catch {
        return {
          success: false,
          error: "Invalid wallet address format",
        };
      }

      console.log(`[Faucet] Processing request for ${walletAddress}`);

      // Get authority token account
      const authorityTokenAccount = await getAssociatedTokenAddress(
        this.mintAddress,
        this.authority.publicKey
      );

      // Get recipient token account (or create if doesn't exist)
      const recipientTokenAccount = await getAssociatedTokenAddress(
        this.mintAddress,
        recipientPubkey
      );

      // Check if recipient token account exists
      let accountExists = false;
      try {
        await getAccount(this.connection, recipientTokenAccount);
        accountExists = true;
      } catch {
        accountExists = false;
      }

      // Build transaction
      const transaction = new Transaction();

      // Create associated token account if needed
      if (!accountExists) {
        console.log(`[Faucet] Creating token account for ${walletAddress}`);
        transaction.add(
          createAssociatedTokenAccountInstruction(
            this.authority.publicKey, // payer
            recipientTokenAccount,     // ata
            recipientPubkey,           // owner
            this.mintAddress           // mint
          )
        );
      }

      // Calculate amount in smallest units (with decimals)
      const amountInSmallestUnits = BigInt(
        Math.floor(this.config.amountPerRequest * Math.pow(10, this.config.decimals))
      );

      // Add transfer instruction
      transaction.add(
        createTransferInstruction(
          authorityTokenAccount,     // source
          recipientTokenAccount,     // destination
          this.authority.publicKey,  // owner
          amountInSmallestUnits      // amount
        )
      );

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.authority.publicKey;

      // Sign and send transaction
      transaction.sign(this.authority);
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        }
      );

      // Confirm transaction
      const confirmation = await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      if (confirmation.value.err) {
        console.error(`[Faucet] Transaction failed:`, confirmation.value.err);
        return {
          success: false,
          error: "Transaction failed on-chain",
        };
      }

      console.log(`[Faucet] ✅ Sent ${this.config.amountPerRequest} HNCZ to ${walletAddress}`);
      console.log(`[Faucet] Signature: ${signature}`);

      return {
        success: true,
        signature,
        amount: this.config.amountPerRequest,
        message: `Successfully sent ${this.config.amountPerRequest} HNCZ tokens`,
      };
    } catch (error: any) {
      console.error("[Faucet] Error sending tokens:", error);

      // Handle specific errors
      if (error.message?.includes("insufficient funds")) {
        return {
          success: false,
          error: "Faucet has insufficient funds. Please contact support.",
        };
      }

      if (error.message?.includes("blockhash not found")) {
        return {
          success: false,
          error: "Network congestion. Please try again in a moment.",
        };
      }

      return {
        success: false,
        error: error.message || "Failed to send tokens. Please try again.",
      };
    }
  }

  /**
   * Get faucet balance
   */
  async getBalance(): Promise<number> {
    try {
      const authorityTokenAccount = await getAssociatedTokenAddress(
        this.mintAddress,
        this.authority.publicKey
      );

      const accountInfo = await getAccount(this.connection, authorityTokenAccount);
      const balance = Number(accountInfo.amount) / Math.pow(10, this.config.decimals);

      return balance;
    } catch (error) {
      console.error("[Faucet] Error getting balance:", error);
      return 0;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; balance?: number; error?: string }> {
    try {
      const balance = await this.getBalance();

      if (balance < this.config.amountPerRequest) {
        return {
          healthy: false,
          balance,
          error: "Insufficient faucet balance",
        };
      }

      return {
        healthy: true,
        balance,
      };
    } catch (error: any) {
      return {
        healthy: false,
        error: error.message,
      };
    }
  }
}
