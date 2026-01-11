import { Router } from "express";
import { FaucetService } from "../services/faucetService.js";
import rateLimit from "express-rate-limit";
import { redis } from "../cache.js";

const router = Router();

// Initialize faucet service
const faucetService = new FaucetService({
  mintAddress: process.env.HNCZ_DEVNET_MINT || "HNcz9fndVXBogLjU55uyvbz79P5qWxaBZVKk7iRSy7jV",
  decimals: parseInt(process.env.HNCZ_DEVNET_DECIMALS || "9"),
  amountPerRequest: parseInt(process.env.HNCZ_FAUCET_AMOUNT || "100000"),
  rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  authorityPrivateKey: process.env.DEV_WALLET_PRIVATE_KEY!,
});

// Rate limiting: 10 requests per IP per hour
const faucetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: "Too many faucet requests from this IP. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/faucet/request
 * Request HNCZ tokens from faucet
 */
router.post("/request", faucetRateLimiter, async (req, res) => {
  try {
    const { walletAddress } = req.body;

    // Validate request
    if (!walletAddress || typeof walletAddress !== "string") {
      return res.status(400).json({
        success: false,
        error: "Wallet address is required",
      });
    }

    // Check wallet-based rate limit (24 hours) using Redis
    const cooldownKey = `faucet:hncz:${walletAddress}`;

    if (redis) {
      const existing = await redis.get(cooldownKey);
      if (existing) {
        const ttl = await redis.ttl(cooldownKey);
        const hoursRemaining = Math.ceil(ttl / 3600);

        return res.status(429).json({
          success: false,
          error: `You can request tokens again in ${hoursRemaining} hour${hoursRemaining > 1 ? 's' : ''}.`,
          retryAfter: hoursRemaining,
        });
      }
    }

    // Send tokens
    const result = await faucetService.sendTokens({
      walletAddress,
      requestIp: req.ip,
    });

    if (result.success) {
      // Set 24-hour cooldown in Redis
      if (redis) {
        await redis.set(cooldownKey, "1", "EX", 24 * 60 * 60); // 24 hours
      }

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
      error: "Internal server error. Please try again later.",
    });
  }
});

/**
 * GET /api/faucet/health
 * Check faucet health and balance
 */
router.get("/health", async (req, res) => {
  try {
    const health = await faucetService.healthCheck();
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
 * Get faucet configuration info
 */
router.get("/info", async (req, res) => {
  try {
    const balance = await faucetService.getBalance();

    res.json({
      mintAddress: process.env.HNCZ_DEVNET_MINT,
      tokenSymbol: "HNCZ",
      tokenName: "HNCZ Devnet Token",
      amountPerRequest: parseInt(process.env.HNCZ_FAUCET_AMOUNT || "100000"),
      balance,
      network: "devnet",
      rateLimitHours: 24,
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

export { router as faucetRouter };
