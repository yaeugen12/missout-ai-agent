import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js/lib/index.cjs.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";

export type TokenType = "classic" | "token2022";

export interface TokenConfig {
  mintAddress: string;
  decimals: number;
  amountPerRequest: number;
  tokenProgramId: PublicKey;
}

export interface FaucetConfig {
  rpcUrl: string;
  authorityPrivateKey: string;
  tokens: {
    classic: TokenConfig;
    token2022: TokenConfig;
  };
}

export interface FaucetRequest {
  walletAddress: string;
  tokenType?: TokenType;
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
  private config: FaucetConfig;

  constructor(config: FaucetConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl, "confirmed");

    // Initialize authority keypair from private key
    try {
      const secretKey = bs58.decode(config.authorityPrivateKey);
      this.authority = Keypair.fromSecretKey(secretKey);
      console.log("[Faucet] Initialized with authority:", this.authority.publicKey.toBase58());
      console.log("[Faucet] Classic token:", config.tokens.classic.mintAddress);
      console.log("[Faucet] Token-2022:", config.tokens.token2022.mintAddress);
    } catch (error) {
      console.error("[Faucet] Failed to initialize authority keypair:", error);
      throw new Error("Invalid authority private key");
    }
  }

  private getTokenConfig(tokenType: TokenType = "classic"): TokenConfig {
    return this.config.tokens[tokenType];
  }

  /**
   * Send tokens to a wallet (supports both Classic SPL and Token-2022)
   */
  async sendTokens(request: FaucetRequest): Promise<FaucetResponse> {
    const { walletAddress, tokenType = "classic" } = request;

    try {
      // Get token configuration
      const tokenConfig = this.getTokenConfig(tokenType);
      const mintAddress = new PublicKey(tokenConfig.mintAddress);

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

      console.log(`[Faucet] Processing ${tokenType} token request for ${walletAddress}`);
      console.log(`[Faucet] Mint: ${mintAddress.toBase58()}`);
      console.log(`[Faucet] Token Program: ${tokenConfig.tokenProgramId.toBase58()}`);

      // Get authority token account
      const authorityTokenAccount = await getAssociatedTokenAddress(
        mintAddress,
        this.authority.publicKey,
        false,
        tokenConfig.tokenProgramId
      );

      console.log(`[Faucet] Authority token account: ${authorityTokenAccount.toBase58()}`);

      // Check authority balance
      try {
        const authorityBalance = await getAccount(this.connection, authorityTokenAccount, undefined, tokenConfig.tokenProgramId);
        console.log(`[Faucet] Authority balance: ${Number(authorityBalance.amount) / Math.pow(10, tokenConfig.decimals)} tokens`);

        if (Number(authorityBalance.amount) < tokenConfig.amountPerRequest * Math.pow(10, tokenConfig.decimals)) {
          return {
            success: false,
            error: `Faucet has insufficient ${tokenType} tokens. Please contact support.`,
          };
        }
      } catch (error: any) {
        console.error(`[Faucet] Authority token account does not exist or error checking balance:`, error.message);
        return {
          success: false,
          error: `Faucet ${tokenType} account not initialized. Please contact support.`,
        };
      }

      // Get recipient token account (or create if doesn't exist)
      const recipientTokenAccount = await getAssociatedTokenAddress(
        mintAddress,
        recipientPubkey,
        false,
        tokenConfig.tokenProgramId
      );

      // Check if recipient token account exists
      let accountExists = false;
      try {
        await getAccount(this.connection, recipientTokenAccount, undefined, tokenConfig.tokenProgramId);
        accountExists = true;
      } catch {
        accountExists = false;
      }

      // Build transaction
      const transaction = new Transaction();

      // Create associated token account if needed
      if (!accountExists) {
        console.log(`[Faucet] Creating ${tokenType} token account for ${walletAddress}`);
        transaction.add(
          createAssociatedTokenAccountInstruction(
            this.authority.publicKey, // payer
            recipientTokenAccount,     // ata
            recipientPubkey,           // owner
            mintAddress,               // mint
            tokenConfig.tokenProgramId
          )
        );
      }

      // Calculate amount in smallest units (with decimals)
      const amountInSmallestUnits = BigInt(
        Math.floor(tokenConfig.amountPerRequest * Math.pow(10, tokenConfig.decimals))
      );

      // Add transfer instruction
      transaction.add(
        createTransferInstruction(
          authorityTokenAccount,     // source
          recipientTokenAccount,     // destination
          this.authority.publicKey,  // owner
          amountInSmallestUnits,     // amount
          [],
          tokenConfig.tokenProgramId
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

      console.log(`[Faucet] ✅ Sent ${tokenConfig.amountPerRequest} ${tokenType} tokens to ${walletAddress}`);
      console.log(`[Faucet] Signature: ${signature}`);

      return {
        success: true,
        signature,
        amount: tokenConfig.amountPerRequest,
        message: `Successfully sent ${tokenConfig.amountPerRequest} tokens`,
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
   * Get faucet balance for a specific token type
   */
  async getBalance(tokenType: TokenType = "classic"): Promise<number> {
    try {
      const tokenConfig = this.getTokenConfig(tokenType);
      const mintAddress = new PublicKey(tokenConfig.mintAddress);

      const authorityTokenAccount = await getAssociatedTokenAddress(
        mintAddress,
        this.authority.publicKey,
        false,
        tokenConfig.tokenProgramId
      );

      const accountInfo = await getAccount(this.connection, authorityTokenAccount, undefined, tokenConfig.tokenProgramId);
      const balance = Number(accountInfo.amount) / Math.pow(10, tokenConfig.decimals);

      return balance;
    } catch (error) {
      console.error(`[Faucet] Error getting ${tokenType} balance:`, error);
      return 0;
    }
  }

  /**
   * Health check for a specific token type
   */
  async healthCheck(tokenType: TokenType = "classic"): Promise<{ healthy: boolean; balance?: number; error?: string }> {
    try {
      const tokenConfig = this.getTokenConfig(tokenType);
      const balance = await this.getBalance(tokenType);

      if (balance < tokenConfig.amountPerRequest) {
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
