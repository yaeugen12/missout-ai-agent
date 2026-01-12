import { Router } from "express";
import { FaucetService } from "../services/faucetService.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const router = Router();

// Initialize faucet service
const faucetService = new FaucetService({
  rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  authorityPrivateKey: process.env.DEV_WALLET_PRIVATE_KEY!,
  tokens: {
    classic: {
      mintAddress: process.env.HNCZ_DEVNET_MINT || "HNcz9fndVXBogLjU55uyvbz79P5qWxaBZVKk7iRSy7jV",
      decimals: parseInt(process.env.HNCZ_DEVNET_DECIMALS || "9"),
      amountPerRequest: parseInt(process.env.HNCZ_FAUCET_AMOUNT || "100000"),
      tokenProgramId: TOKEN_PROGRAM_ID,
    },
    token2022: {
      mintAddress: process.env.TOKEN2022_DEVNET_MINT || "BhzvZjrFpMtmCamkuPvc1tfrdQHaVovRzvFhqgVj2yRH",
      decimals: parseInt(process.env.TOKEN2022_DEVNET_DECIMALS || "9"),
      amountPerRequest: parseInt(process.env.TOKEN2022_FAUCET_AMOUNT || "100000"),
      tokenProgramId: TOKEN_2022_PROGRAM_ID,
    },
  },
});

/**
 * POST /api/faucet/request
 * Send tokens with NO RATE LIMIT
 */
router.post("/request", async (req, res) => {
  try {
    const { walletAddress, tokenType = "classic" } = req.body;

    if (!walletAddress || typeof walletAddress !== "string") {
      return res.status(400).json({
        success: false,
        error: "Wallet address is required",
      });
    }

    if (tokenType !== "classic" && tokenType !== "token2022") {
      return res.status(400).json({
        success: false,
        error: "Invalid token type. Must be 'classic' or 'token2022'",
      });
    }

    // Send tokens (no rate limit)
    const result = await faucetService.sendTokens({
      walletAddress,
      tokenType,
      requestIp: req.ip,
    });

    if (result.success) {
      return res.json({
        ...result,
        explorerUrl: `https://explorer.solana.com/tx/${result.signature}?cluster=devnet`,
      });
    } else {
      return res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("[Faucet Route] Error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error.",
    });
  }
});

/**
 * GET /api/faucet/health
 */
router.get("/health", async (req, res) => {
  try {
    const { tokenType = "classic" } = req.query;
    const validTokenType = (tokenType === "classic" || tokenType === "token2022") ? tokenType : "classic";
    const health = await faucetService.healthCheck(validTokenType);
    res.json(health);
  } catch (error: any) {
    res.status(500).json({
      healthy: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/faucet/info
 */
router.get("/info", async (req, res) => {
  try {
    const { tokenType = "classic" } = req.query;
    const validTokenType = (tokenType === "classic" || tokenType === "token2022") ? tokenType : "classic";
    const balance = await faucetService.getBalance(validTokenType);

    const tokenConfig = validTokenType === "classic" ? {
      mintAddress: process.env.HNCZ_DEVNET_MINT,
      tokenSymbol: "HNCZ",
      tokenName: "HNCZ Devnet Token",
      amountPerRequest: parseInt(process.env.HNCZ_FAUCET_AMOUNT || "100000"),
    } : {
      mintAddress: process.env.TOKEN2022_DEVNET_MINT,
      tokenSymbol: "T2022",
      tokenName: "Token-2022 Devnet",
      amountPerRequest: parseInt(process.env.TOKEN2022_FAUCET_AMOUNT || "100000"),
    };

    res.json({
      ...tokenConfig,
      balance,
      network: "devnet",
      rateLimitHours: 0,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

export { router as faucetRouter };
