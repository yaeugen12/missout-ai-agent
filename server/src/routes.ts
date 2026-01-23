import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage.js";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import { tokenDiscoveryService, type DiscoveredToken } from "./tokenDiscoveryService.js";
import { poolMonitor } from "./pool-monitor/index.js";
import { db, pool as pgPool } from "./db.js";
import { pools, updateProfileSchema } from "@shared/schema";
import nacl from "tweetnacl";
import bs58 from "bs58";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import {
  verifyClaimRefundTransaction,
  verifyClaimRentTransaction,
  verifyPoolCreationTransaction,
  verifyJoinTransaction,
  verifyCancelPoolTransaction,
  verifyDonateTransaction
} from "./transactionVerifier.js";
import {
  isTxHashUsed,
  markTxHashUsed
} from "./transactionHashTracker.js";
import { cacheMiddleware, invalidateCache } from "./cache-middleware.js";
import { parsePaginationParams, createPaginatedResponse, paginateArray } from "./pagination.js";
import rateLimit from "express-rate-limit";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage.js";
import { notificationService, NotificationType } from "./notifications/notificationService.js";
import { logger } from "./logger.js";
import { getPriceTrackingService } from "./index.js";
import { fetchTokenPriceUsd } from "./utils/priceUtils.js";

// ===========================================
// SECURITY: Rate Limiting
// ===========================================

// Strict rate limiter for upload endpoint (10 uploads per 5 minutes)
const strictLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 requests per windowMs
  message: "Too many uploads. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// ===========================================
// SECURITY: File Upload Hardening
// ===========================================

// Allowed image types with their magic bytes (file signatures)
const ALLOWED_IMAGE_TYPES: Record<string, { mimeType: string; magicBytes: number[][] }> = {
  '.jpg': { mimeType: 'image/jpeg', magicBytes: [[0xFF, 0xD8, 0xFF]] },
  '.jpeg': { mimeType: 'image/jpeg', magicBytes: [[0xFF, 0xD8, 0xFF]] },
  '.png': { mimeType: 'image/png', magicBytes: [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]] },
  '.gif': { mimeType: 'image/gif', magicBytes: [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]] },
  '.webp': { mimeType: 'image/webp', magicBytes: [[0x52, 0x49, 0x46, 0x46]] }, // RIFF header
};

// Validate file content matches claimed type
async function validateImageContent(filePath: string, claimedMimeType: string): Promise<boolean> {
  try {
    const buffer = Buffer.alloc(12);
    const fileHandle = await fs.open(filePath, 'r');
    await fileHandle.read(buffer, 0, 12, 0);
    await fileHandle.close();

    // Find expected magic bytes for this mime type
    for (const [ext, config] of Object.entries(ALLOWED_IMAGE_TYPES)) {
      if (config.mimeType === claimedMimeType) {
        for (const magic of config.magicBytes) {
          let matches = true;
          for (let i = 0; i < magic.length; i++) {
            if (buffer[i] !== magic[i]) {
              matches = false;
              break;
            }
          }
          if (matches) return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

// SECURITY NOTE: We don't sanitize user-provided filenames. Instead, we generate
// cryptographically secure random filenames using crypto.randomBytes(16).
// This completely eliminates path traversal risks and filename-based attacks.

// Setup upload directory
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const storage_multer = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    } catch (err) {
      cb(err as Error, UPLOAD_DIR);
    }
  },
  filename: (req, file, cb) => {
    // Generate secure random filename to prevent guessing
    const randomId = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    // Validate extension
    if (!ALLOWED_IMAGE_TYPES[ext]) {
      return cb(new Error('Invalid file extension'), '');
    }
    cb(null, `${randomId}${ext}`);
  }
});

const upload = multer({ 
  storage: storage_multer,
  limits: { 
    fileSize: 2 * 1024 * 1024, // 2MB max
    files: 1 // Only 1 file per request
  },
  fileFilter: (req, file, cb) => {
    // Check mime type
    const allowedMimes = Object.values(ALLOWED_IMAGE_TYPES).map(t => t.mimeType);
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WEBP allowed.'));
    }
    // Check extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMAGE_TYPES[ext]) {
      return cb(new Error('Invalid file extension.'));
    }
    // Verify extension matches mime type
    if (ALLOWED_IMAGE_TYPES[ext].mimeType !== file.mimetype) {
      return cb(new Error('File extension does not match content type.'));
    }
    cb(null, true);
  }
});

// ===========================================
// SECURITY: Wallet Signature Verification
// ===========================================
function verifyWalletSignature(walletAddress: string, message: string, signature: string): boolean {
  try {
    const publicKey = bs58.decode(walletAddress);
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.decode(signature);
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);
  } catch {
    return false;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Upload Endpoint with security validation + strict rate limiting (10 uploads per 5 minutes)
  app.post("/api/upload", strictLimiter, upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // SECURITY: Validate actual file content matches claimed mime type
    const isValidContent = await validateImageContent(req.file.path, req.file.mimetype);
    if (!isValidContent) {
      // Delete the invalid file
      try {
        await fs.unlink(req.file.path);
      } catch {}
      console.log("[SECURITY] Rejected upload - content does not match mime type");
      return res.status(400).json({ message: "Invalid file content. File does not appear to be a valid image." });
    }

    try {
      // Upload to Google Cloud Storage for persistence across deployments
      const bucket = objectStorageClient.bucket(process.env.GCLOUD_BUCKET || 'missout-storage');
      const gcsFileName = `avatars/${req.file.filename}`;
      const file = bucket.file(gcsFileName);

      // Upload the file to GCS
      await file.save(await fs.readFile(req.file.path), {
        contentType: req.file.mimetype,
        public: true, // Make file publicly accessible
        metadata: {
          cacheControl: 'public, max-age=31536000', // Cache for 1 year
        },
      });

      // Get public URL
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${gcsFileName}`;

      // Delete local temp file
      await fs.unlink(req.file.path);

      console.log("[UPLOAD] File uploaded to GCS:", publicUrl);
      res.json({ url: publicUrl });
    } catch (error: any) {
      console.error("[UPLOAD] Failed to upload to GCS:", error);
      // Fallback to local storage (will be lost on redeploy)
      const publicUrl = `/uploads/${req.file.filename}`;
      console.log("[UPLOAD] Using local storage fallback:", publicUrl);
      res.json({ url: publicUrl });
    }
  });
  // Pools
  app.get(api.pools.list.path, cacheMiddleware({ ttl: 30 }), async (req, res) => {
    const pagination = parsePaginationParams(req);
    const { pools: allPools, total: totalPools } = await storage.getPools(pagination.limit, pagination.offset);

    // Filter out ended and cancelled pools from Pool Terminal
    // Keep only active pools (open, locked, unlocking, randomness, winnerSelected)
    const activePools = allPools.filter(pool => pool.status !== 'cancelled' && pool.status !== 'ended');

    // Create paginated response
    const response = createPaginatedResponse(activePools, totalPools, pagination);

    res.json(response);
  });

  // Helper function to fetch token logo from Helius DAS API
  async function getTokenLogo(mintAddress: string): Promise<string | undefined> {
    try {
      const HELIUS_DAS_RPC = process.env.HELIUS_DAS_API_URL || process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
      const response = await fetch(HELIUS_DAS_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "get-asset",
          method: "getAsset",
          params: { id: mintAddress }
        })
      });

      const data = await response.json();
      if (data.result?.content?.files && data.result.content.files.length > 0) {
        return data.result.content.files[0]?.cdn_uri || data.result.content.files[0]?.uri;
      }

      if (data.result?.content?.links?.image) {
        return data.result.content.links.image;
      }
    } catch (error) {
      console.warn(`Failed to fetch logo for ${mintAddress}:`, error);
    }
    return undefined;
  }

  // OPTIMIZED: Get claimable pools using single query (fixes N+1 problem)
  app.get("/api/pools/claimable", async (req, res) => {
    try {
      const wallet = req.query.wallet as string;
      if (!wallet) {
        return res.status(400).json({ message: "Wallet address required" });
      }

      // OPTIMIZED: Use new getClaimablePools method - 2 queries instead of N+1
      const { refunds: refundPools, rents: rentPools } = await storage.getClaimablePools(wallet);

      // Fetch logos for all unique token mints
      const uniqueMints = [...new Set([
        ...refundPools.map(p => p.tokenMint),
        ...rentPools.map(p => p.tokenMint)
      ])];

      const logoMap = new Map<string, string | undefined>();
      await Promise.all(
        uniqueMints.map(async (mint) => {
          const logo = await getTokenLogo(mint);
          logoMap.set(mint, logo);
        })
      );

      // Format refunds for frontend
      const refunds = refundPools.map(pool => ({
        id: pool.id,
        onChainAddress: pool.poolAddress,
        status: pool.status,
        tokenMint: pool.tokenMint,
        tokenSymbol: pool.tokenSymbol,
        tokenLogoUrl: logoMap.get(pool.tokenMint),
        entryFee: pool.entryAmount.toString(),
        creatorWallet: pool.creatorWallet,
        participants: pool.participants.map(p => p.walletAddress),
      }));

      // Format rents for frontend
      const rents = rentPools.map(pool => ({
        id: pool.id,
        onChainAddress: pool.poolAddress,
        status: pool.status,
        tokenMint: pool.tokenMint,
        tokenSymbol: pool.tokenSymbol,
        tokenLogoUrl: logoMap.get(pool.tokenMint),
        entryFee: pool.entryAmount.toString(),
        creatorWallet: pool.creatorWallet,
        participants: [], // No participants needed for rent claims
        participantsCount: pool.participantsCount || 0, // Include participants count for validation
      }));

      res.json({ refunds, rents });
    } catch (error) {
      console.error("Error fetching claimable pools:", error);
      res.status(500).json({ message: "Failed to fetch claimable pools" });
    }
  });

  // Mark refund as claimed - SECURITY: Requires wallet signature + on-chain tx proof
  app.post("/api/pools/:poolId/claim-refund", async (req, res) => {
    try {
      const poolId = Number(req.params.poolId);
      const { wallet, txHash, signature, message } = req.body;

      if (!wallet) {
        return res.status(400).json({ message: "Wallet address required" });
      }

      // SECURITY: Require cryptographic signature to prove wallet ownership
      if (!signature || !message) {
        console.log("[SECURITY] Claim refund rejected - missing signature");
        return res.status(400).json({ message: "Wallet signature required to prove ownership" });
      }

      // Verify the signature proves wallet ownership
      if (!verifyWalletSignature(wallet, message, signature)) {
        console.log("[SECURITY] Claim refund rejected - invalid signature");
        return res.status(401).json({ message: "Invalid wallet signature" });
      }

      // Validate message contains expected claim info (prevent replay attacks)
      const expectedMessagePattern = `claim-refund:${poolId}:`;
      if (!message.startsWith(expectedMessagePattern)) {
        console.log("[SECURITY] Claim refund rejected - invalid message format");
        return res.status(400).json({ message: "Invalid claim message format" });
      }

      // SECURITY: Require transaction hash as proof of on-chain claim
      if (!txHash) {
        console.log("[SECURITY] Claim refund rejected - no txHash provided");
        return res.status(400).json({ message: "Transaction hash required as proof of on-chain claim" });
      }

      // Validate txHash format
      if (!txHash.match(/^[1-9A-HJ-NP-Za-km-z]{87,88}$/)) {
        return res.status(400).json({ message: "Invalid transaction signature format" });
      }

      // Get pool to verify on-chain
      const pool = await storage.getPool(poolId);
      if (!pool) {
        return res.status(404).json({ message: "Pool not found" });
      }

      // 🔐 REPLAY PROTECTION: Check if transaction hash already used
      const txAlreadyUsed = await isTxHashUsed(txHash);
      if (txAlreadyUsed) {
        console.log("[SECURITY] Replay attack detected - tx already used:", { txHash: txHash.slice(0, 20), poolId, wallet });
        return res.status(409).json({ message: "Transaction hash already used" });
      }

      // SECURITY: Verify transaction contains actual claim_refund instruction
      if (!pool.poolAddress) {
        return res.status(400).json({ message: "Pool has no on-chain address" });
      }

      const verification = await verifyClaimRefundTransaction(
        txHash,
        wallet,
        pool.poolAddress
      );

      if (!verification.valid) {
        console.log("[REFUND_VERIFY] Transaction verification failed:", verification.reason);
        return res.status(400).json({ message: verification.reason || "Transaction verification failed" });
      }

      // Verify participant exists (case-insensitive comparison)
      const participantsList = await storage.getParticipants(poolId);
      const participant = participantsList.find(p => p.walletAddress.toLowerCase() === wallet.toLowerCase());

      if (!participant) {
        return res.status(404).json({ message: "Participant not found in this pool" });
      }

      // 🔐 ATOMIC TRANSACTION: Mark tx as used + mark refund claimed
      // This prevents race conditions - PostgreSQL UNIQUE constraint ensures atomicity
      const client = await pgPool.connect();

      try {
        await client.query("BEGIN");

        // Mark transaction as used (will throw if duplicate due to UNIQUE constraint)
        await markTxHashUsed(txHash, poolId, wallet, "claim_refund");

        // Atomic update: only marks if refundClaimed = 0
        const result = await storage.markRefundClaimed(poolId, wallet);

        if (!result) {
          throw new Error("Refund already claimed or participant not found");
        }

        await client.query("COMMIT");
        client.release();

        console.log("[CLAIM] Refund marked as claimed (on-chain verified):", { poolId, wallet, txHash: txHash.substring(0, 20) + "..." });
        res.json({ success: true });
      } catch (err: any) {
        await client.query("ROLLBACK");
        client.release();

        if (err.message.includes("already used")) {
          console.log("[SECURITY] Race condition prevented by UNIQUE constraint:", { txHash: txHash.slice(0, 20) });
          return res.status(409).json({ message: "Transaction already processed" });
        }

        if (err.message.includes("already claimed")) {
          return res.status(409).json({ message: "Refund already claimed" });
        }

        throw err;
      }
    } catch (error) {
      console.error("Error marking refund as claimed:", error);
      res.status(500).json({ message: "Failed to mark refund as claimed" });
    }
  });

  // Mark rent as claimed - SECURITY: Requires wallet signature + creator verification + on-chain tx proof
  app.post("/api/pools/:poolId/claim-rent", async (req, res) => {
    try {
      const poolId = Number(req.params.poolId);
      const { wallet, txHash, signature, message } = req.body;

      // SECURITY: Require wallet and txHash
      if (!wallet) {
        return res.status(400).json({ message: "Wallet address required" });
      }

      // SECURITY: Require cryptographic signature to prove wallet ownership
      if (!signature || !message) {
        console.log("[SECURITY] Claim rent rejected - missing signature");
        return res.status(400).json({ message: "Wallet signature required to prove ownership" });
      }

      // Verify the signature proves wallet ownership
      if (!verifyWalletSignature(wallet, message, signature)) {
        console.log("[SECURITY] Claim rent rejected - invalid signature");
        return res.status(401).json({ message: "Invalid wallet signature" });
      }

      // Validate message contains expected claim info (prevent replay attacks)
      const expectedMessagePattern = `claim-rent:${poolId}:`;
      if (!message.startsWith(expectedMessagePattern)) {
        console.log("[SECURITY] Claim rent rejected - invalid message format");
        return res.status(400).json({ message: "Invalid claim message format" });
      }

      if (!txHash) {
        console.log("[SECURITY] Claim rent rejected - no txHash provided");
        return res.status(400).json({ message: "Transaction hash required as proof of on-chain claim" });
      }

      // Validate txHash format
      if (!txHash.match(/^[1-9A-HJ-NP-Za-km-z]{87,88}$/)) {
        return res.status(400).json({ message: "Invalid transaction signature format" });
      }

      // SECURITY: Verify caller is the pool creator
      const pool = await storage.getPool(poolId);
      if (!pool) {
        return res.status(404).json({ message: "Pool not found" });
      }

      // Normalize both wallet addresses for case-insensitive comparison
      if (pool.creatorWallet.toLowerCase() !== wallet.toLowerCase()) {
        console.log("[SECURITY] Claim rent rejected - not creator:", { wallet, creator: pool.creatorWallet });
        return res.status(403).json({ message: "Only pool creator can claim rent" });
      }

      // 🔐 REPLAY PROTECTION: Check if transaction hash already used
      const txAlreadyUsed = await isTxHashUsed(txHash);
      if (txAlreadyUsed) {
        console.log("[SECURITY] Replay attack detected - tx already used:", { txHash: txHash.slice(0, 20), poolId, wallet });
        return res.status(409).json({ message: "Transaction hash already used" });
      }

      // 🔐 SECURITY: Verify claim_rent transaction on-chain
      if (!pool.poolAddress) {
        return res.status(400).json({ message: "Pool has no on-chain address" });
      }

      const verification = await verifyClaimRentTransaction(
        txHash,
        wallet,
        pool.poolAddress
      );

      if (!verification.valid) {
        console.log("[RENT_VERIFY] Transaction verification failed:", verification.reason);
        return res.status(400).json({
          message: verification.reason || "Transaction verification failed",
        });
      }

      console.log("[RENT_VERIFY] ✅ Verified rent claim transaction:", {
        txHash: txHash.substring(0, 20) + "...",
        wallet: wallet.substring(0, 16) + "...",
      });

      // 🔐 ATOMIC TRANSACTION: Mark tx as used + mark rent claimed
      const client = await pgPool.connect();

      try {
        await client.query("BEGIN");

        // Mark transaction as used (will throw if duplicate due to UNIQUE constraint)
        await markTxHashUsed(txHash, poolId, wallet, "claim_rent");

        // Atomic update: only marks if rentClaimed = 0
        const result = await storage.markRentClaimed(poolId);

        if (!result) {
          throw new Error("Rent already claimed or pool not found");
        }

        await client.query("COMMIT");
        client.release();

        console.log("[CLAIM] Rent marked as claimed (verified):", { poolId, wallet, txHash: txHash.substring(0, 20) + "..." });
        res.json({ success: true });
      } catch (err: any) {
        await client.query("ROLLBACK");
        client.release();

        if (err.message.includes("already used")) {
          console.log("[SECURITY] Race condition prevented by UNIQUE constraint:", { txHash: txHash.slice(0, 20) });
          return res.status(409).json({ message: "Transaction already processed" });
        }

        if (err.message.includes("already claimed")) {
          return res.status(409).json({ message: "Rent already claimed" });
        }

        throw err;
      }
    } catch (error) {
      console.error("Error marking rent as claimed:", error);
      res.status(500).json({ message: "Failed to mark rent as claimed" });
    }
  });

  app.get(api.pools.get.path, cacheMiddleware({ ttl: 3 }), async (req, res) => {
    const id = Number(req.params.id);
    const pool = await storage.getPool(id);
    if (!pool) return res.status(404).json({ message: "Pool not found" });

    const participants = await storage.getParticipantsWithProfiles(id);
    res.json({ ...pool, participants });
  });

  app.post(api.pools.create.path, async (req, res) => {
    console.log("=== BACKEND_POST_RECEIVED ===");
    console.log("RAW_BODY:", JSON.stringify(req.body, null, 2));

    try {
      const input = api.pools.create.input.parse(req.body);

      console.log("PARSED_INPUT:", { txHash: input.txHash, poolAddress: input.poolAddress, creatorWallet: input.creatorWallet });

      // CRITICAL: Block pool creation without on-chain transaction proof
      // This prevents fake pools from cached frontend code
      if (!input.txHash || !input.poolAddress) {
        console.log("[ANTI-FAKE] Rejected pool creation - missing txHash or poolAddress:", {
          txHash: input.txHash,
          poolAddress: input.poolAddress,
          creatorWallet: input.creatorWallet
        });
        return res.status(400).json({
          message: "Pool creation requires on-chain transaction. Please sign with your wallet.",
          field: "txHash"
        });
      }

      // Validate txHash format (should be a Solana transaction signature)
      if (!input.txHash.match(/^[1-9A-HJ-NP-Za-km-z]{87,88}$/)) {
        console.log("[ANTI-FAKE] Rejected pool creation - invalid txHash format:", input.txHash);
        return res.status(400).json({
          message: "Invalid transaction signature format",
          field: "txHash"
        });
      }

      // Validate poolAddress format (should be a Solana public key)
      if (!input.poolAddress.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
        console.log("[ANTI-FAKE] Rejected pool creation - invalid poolAddress format:", input.poolAddress);
        return res.status(400).json({
          message: "Invalid pool address format",
          field: "poolAddress"
        });
      }

      // 🔐 REPLAY PROTECTION: Check if transaction hash already used
      const txAlreadyUsed = await isTxHashUsed(input.txHash);
      if (txAlreadyUsed) {
        console.log("[SECURITY] Replay attack detected - tx already used:", { txHash: input.txHash.slice(0, 20), wallet: input.creatorWallet });
        return res.status(409).json({
          message: "Transaction hash already used",
          field: "txHash"
        });
      }

      // 🔐 SECURITY FIX: Verify transaction exists on-chain
      // This prevents attackers from submitting fake pool creation requests
      const verification = await verifyPoolCreationTransaction(
        input.txHash,
        input.poolAddress,
        input.creatorWallet
      );

      if (!verification.valid) {
        console.log("[ANTI-FAKE] Transaction verification failed:", verification.reason);
        return res.status(400).json({
          message: verification.reason || "Transaction verification failed",
          field: "txHash"
        });
      }

      // Check if pool already exists in database (prevent duplicate registrations)
      const existingPoolByAddress = await storage.getPoolByAddress(input.poolAddress);
      if (existingPoolByAddress) {
        console.log("[ANTI-FAKE] Pool already registered:", input.poolAddress);
        return res.status(409).json({
          message: "Pool already registered in the system",
          field: "poolAddress"
        });
      }

      const existingPoolByTxHash = await storage.getPoolByTxHash(input.txHash);
      if (existingPoolByTxHash) {
        console.log("[ANTI-FAKE] Transaction already used:", input.txHash);
        return res.status(409).json({
          message: "Transaction already used to create a pool",
          field: "txHash"
        });
      }

      console.log("[POOL CREATE] ✅ Verified on-chain pool:", {
        txHash: input.txHash.substring(0, 20) + "...",
        poolAddress: input.poolAddress
      });

      // Fetch initial token price from mainnet
      let initialPrice: number | null = null;
      try {
        initialPrice = await fetchTokenPriceUsd(input.tokenMint);
        if (initialPrice && initialPrice > 0) {
          console.log(`[POOL CREATE] ✅ Token price fetched: $${initialPrice.toFixed(6)}`);
        } else {
          console.warn(`[POOL CREATE] ⚠️  Token price not available for ${input.tokenMint}`);
        }
      } catch (err: any) {
        console.warn(`[POOL CREATE] ⚠️  Failed to fetch token price: ${err.message}`);
      }

      // 🔐 ATOMIC TRANSACTION: Create pool + mark tx as used
      const client = await pgPool.connect();

      try {
        await client.query("BEGIN");

        // Create pool with initial price
        const poolInput = {
          ...input,
          initialPriceUsd: initialPrice,
          currentPriceUsd: initialPrice,
        };
        const pool = await storage.createPool(poolInput);

        // Mark transaction as used
        await markTxHashUsed(input.txHash, pool.id, input.creatorWallet, "create_pool");

        // A) CREATOR MUST ALWAYS BE FIRST PARTICIPANT
        console.log("[POOL CREATE] Adding creator as first participant:", input.creatorWallet);
        const betUsd = initialPrice && pool.entryAmount ? pool.entryAmount * initialPrice : null;
        await storage.addParticipant({
          poolId: pool.id,
          walletAddress: input.creatorWallet,
          betUsd: betUsd,
          priceAtJoinUsd: initialPrice,
          // Avatar will be fetched from profile when participants are retrieved
        });

        // Add transaction record for creator (CREATE)
        await storage.addTransaction({
          poolId: pool.id,
          walletAddress: input.creatorWallet,
          type: 'CREATE',
          amount: pool.entryAmount,
          txHash: input.txHash
        });

        await client.query("COMMIT");
        client.release();

        // Start real-time price tracking for this pool
        const priceTrackingService = getPriceTrackingService();
        if (priceTrackingService && input.tokenMint) {
          await priceTrackingService.startTracking(pool.id, input.tokenMint);
          console.log(`[POOL CREATE] ✅ Started price tracking for pool ${pool.id}`);
        }

        // Invalidate pools cache
        await invalidateCache("api:GET:/api/pools*");

        res.status(201).json(pool);
      } catch (err: any) {
        await client.query("ROLLBACK");
        client.release();

        if (err.message.includes("already used")) {
          console.log("[SECURITY] Race condition prevented by UNIQUE constraint:", { txHash: input.txHash.slice(0, 20) });
          return res.status(409).json({
            message: "Transaction already processed",
            field: "txHash"
          });
        }

        throw err;
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.post(api.pools.join.path, async (req, res) => {
    console.log("=== BACKEND_JOIN_RECEIVED ===");
    console.log("RAW_BODY:", JSON.stringify(req.body, null, 2));
    
    try {
      const id = Number(req.params.id);
      const input = z.object({ 
        walletAddress: z.string(), 
        avatar: z.string().optional(),
        txHash: z.string().optional() // On-chain transaction proof
      }).parse(req.body);
      
      const pool = await storage.getPool(id);
      if (!pool) return res.status(404).json({ message: "Pool not found" });
      if (pool.status !== 'open') return res.status(400).json({ message: "Pool is not open" });
      if ((pool.participantsCount || 0) >= pool.maxParticipants) return res.status(400).json({ message: "Pool is full" });

      // Require txHash for real pools (pools with poolAddress)
      if (pool.poolAddress && !input.txHash) {
        console.log("[ANTI-FAKE] Rejected join - missing txHash for on-chain pool");
        return res.status(400).json({ message: "Join requires on-chain transaction signature" });
      }

      // Validate txHash format if provided
      if (input.txHash && !input.txHash.match(/^[1-9A-HJ-NP-Za-km-z]{87,88}$/)) {
        return res.status(400).json({ message: "Invalid transaction signature format" });
      }

      // 🔐 REPLAY PROTECTION: Check if transaction hash already used (for on-chain pools)
      if (pool.poolAddress && input.txHash) {
        const txAlreadyUsed = await isTxHashUsed(input.txHash);
        if (txAlreadyUsed) {
          console.log("[SECURITY] Replay attack detected - tx already used:", { txHash: input.txHash.slice(0, 20), poolId: id, wallet: input.walletAddress });
          return res.status(409).json({ message: "Transaction hash already used" });
        }
      }

      // 🔐 SECURITY FIX: Verify join transaction exists on-chain (for on-chain pools)
      if (pool.poolAddress && input.txHash) {
        const verification = await verifyJoinTransaction(
          input.txHash,
          pool.poolAddress,
          input.walletAddress
        );

        if (!verification.valid) {
          console.log("[ANTI-FAKE] Join transaction verification failed:", verification.reason);
          return res.status(400).json({
            message: verification.reason || "Transaction verification failed"
          });
        }

        console.log("[JOIN] ✅ Verified on-chain join:", {
          txHash: input.txHash.substring(0, 20) + "...",
          wallet: input.walletAddress
        });
      } else {
        console.log("[JOIN] Local pool join (no verification required):", { wallet: input.walletAddress });
      }

      // Get current token price for USD tracking
      const currentPrice = pool.currentPriceUsd || await fetchTokenPriceUsd(pool.tokenMint || '');
      const betUsd = currentPrice && pool.entryAmount ? pool.entryAmount * currentPrice : null;

      if (currentPrice) {
        console.log(`[JOIN] Current token price: $${currentPrice.toFixed(6)}, Bet USD: $${betUsd?.toFixed(2)}`);
      }

      // 🔐 ATOMIC TRANSACTION: Add participant + mark tx as used (for on-chain pools)
      let participant;
      let updatedPool;

      if (pool.poolAddress && input.txHash) {
        const client = await pgPool.connect();

        try {
          await client.query("BEGIN");

          // Mark transaction as used
          await markTxHashUsed(input.txHash, id, input.walletAddress, "join");

          // Add participant with USD tracking
          participant = await storage.addParticipant({
            poolId: id,
            walletAddress: input.walletAddress,
            betUsd: betUsd,
            priceAtJoinUsd: currentPrice,
            // Avatar will be fetched from profile when participants are retrieved
          });

          // Add join transaction
          await storage.addTransaction({
            poolId: id,
            walletAddress: input.walletAddress,
            type: 'JOIN',
            amount: pool.entryAmount,
            txHash: input.txHash
          });

          await client.query("COMMIT");
          client.release();

          // Invalidate pools cache
          await invalidateCache(`api:GET:/api/pools/${id}*`);
          await invalidateCache("api:GET:/api/pools*");

          // Return updated pool data
          updatedPool = await storage.getPool(id);

          // 📢 NOTIFY: Send JOIN notification to creator + existing participants
          // IMPORTANT: Creator becomes first participant on pool creation - don't notify them about their own join
          const poolParticipants = await storage.getParticipants(id);

          if (updatedPool && poolParticipants && poolParticipants.length > 0) {
            const isCreatorJoining = input.walletAddress.toLowerCase() === updatedPool.creatorWallet.toLowerCase();

            // If creator is joining (first participant), DON'T send notification
            if (isCreatorJoining) {
              logger.info('[NOTIFICATIONS] JOIN event - creator joining their own pool, skipping notification', {
                poolId: updatedPool.id,
                creator: updatedPool.creatorWallet.slice(0, 8),
              });
            } else {
              // Someone else joined - notify creator + existing participants (except new joiner)
              const existingParticipants = poolParticipants.filter(
                p => p.walletAddress.toLowerCase() !== input.walletAddress.toLowerCase()
              );

              // Notify creator + all existing participants (not the new joiner)
              // Use Set to avoid duplicates (creator is also a participant)
              const walletsToNotify = Array.from(new Set([
                updatedPool.creatorWallet.toLowerCase(),
                ...existingParticipants.map(p => p.walletAddress.toLowerCase())
              ]));

              logger.info('[NOTIFICATIONS] JOIN event - notifying creator + existing participants', {
                poolId: updatedPool.id,
                newJoiner: input.walletAddress.slice(0, 8),
                walletsToNotify: walletsToNotify.map(w => w.slice(0, 8)),
                totalNotifications: walletsToNotify.length
              });

              await notificationService.notifyWallets(walletsToNotify, {
                type: NotificationType.JOIN,
                title: 'New Participant',
                message: `Someone joined the ${updatedPool.tokenName} pool! (${updatedPool.participantsCount}/${updatedPool.maxParticipants})`,
                poolId: updatedPool.id,
                poolName: `${updatedPool.tokenName} Pool`,
              });
            }
          }
        } catch (err: any) {
          await client.query("ROLLBACK");
          client.release();

          // SECURITY: Handle duplicate participant error
          if (err.message?.includes("DUPLICATE_PARTICIPANT")) {
            console.log("[SECURITY] Blocked duplicate join attempt:", input.walletAddress);
            return res.status(409).json({ message: "You have already joined this pool" });
          }

          if (err.message.includes("already used")) {
            console.log("[SECURITY] Race condition prevented by UNIQUE constraint:", { txHash: input.txHash.slice(0, 20) });
            return res.status(409).json({ message: "Transaction already processed" });
          }

          throw err;
        }
      } else {
        // Local/mock pool - no replay protection needed
        try {
          participant = await storage.addParticipant({
            poolId: id,
            walletAddress: input.walletAddress,
            betUsd: betUsd,
            priceAtJoinUsd: currentPrice,
            // Avatar will be fetched from profile when participants are retrieved
          });

          // Add join transaction
          await storage.addTransaction({
            poolId: id,
            walletAddress: input.walletAddress,
            type: 'JOIN',
            amount: pool.entryAmount,
            txHash: input.txHash
          });

          updatedPool = await storage.getPool(id);

          // 📢 NOTIFY: Send JOIN notification to creator + existing participants (local pools)
          // IMPORTANT: Creator becomes first participant on pool creation - don't notify them about their own join
          const poolParticipants = await storage.getParticipants(id);

          if (updatedPool && poolParticipants && poolParticipants.length > 0) {
            const isCreatorJoining = input.walletAddress.toLowerCase() === updatedPool.creatorWallet.toLowerCase();

            // If creator is joining (first participant), DON'T send notification
            if (isCreatorJoining) {
              logger.info('[NOTIFICATIONS] JOIN event - creator joining their own pool, skipping notification', {
                poolId: updatedPool.id,
                creator: updatedPool.creatorWallet.slice(0, 8),
              });
            } else {
              // Someone else joined - notify creator + existing participants (except new joiner)
              const existingParticipants = poolParticipants.filter(
                p => p.walletAddress.toLowerCase() !== input.walletAddress.toLowerCase()
              );

              // Notify creator + all existing participants (not the new joiner)
              // Use Set to avoid duplicates (creator is also a participant)
              const walletsToNotify = Array.from(new Set([
                updatedPool.creatorWallet.toLowerCase(),
                ...existingParticipants.map(p => p.walletAddress.toLowerCase())
              ]));

              logger.info('[NOTIFICATIONS] JOIN event - notifying creator + existing participants', {
                poolId: updatedPool.id,
                newJoiner: input.walletAddress.slice(0, 8),
                walletsToNotify: walletsToNotify.map(w => w.slice(0, 8)),
                totalNotifications: walletsToNotify.length
              });

              await notificationService.notifyWallets(walletsToNotify, {
                type: NotificationType.JOIN,
                title: 'New Participant',
                message: `Someone joined the ${updatedPool.tokenName} pool! (${updatedPool.participantsCount}/${updatedPool.maxParticipants})`,
                poolId: updatedPool.id,
                poolName: `${updatedPool.tokenName} Pool`,
              });
            }
          }
        } catch (err: any) {
          // SECURITY: Handle duplicate participant error
          if (err.message?.includes("DUPLICATE_PARTICIPANT")) {
            console.log("[SECURITY] Blocked duplicate join attempt:", input.walletAddress);
            return res.status(409).json({ message: "You have already joined this pool" });
          }
          throw err;
        }
      }

      res.json({ participant, pool: updatedPool });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Cancel pool
  app.post("/api/pools/:id/cancel", async (req, res) => {
    try {
      const poolId = parseInt(req.params.id);
      const input = z.object({
        walletAddress: z.string(),
        txHash: z.string(),
      }).parse(req.body);

      // Fetch pool to get poolAddress
      const pool = await storage.getPool(poolId);
      if (!pool) {
        return res.status(404).json({ message: "Pool not found" });
      }

      if (!pool.poolAddress) {
        return res.status(400).json({ message: "Pool has no on-chain address" });
      }

      // Validate txHash format
      if (!input.txHash.match(/^[1-9A-HJ-NP-Za-km-z]{87,88}$/)) {
        return res.status(400).json({ message: "Invalid transaction signature format" });
      }

      // 🔐 REPLAY PROTECTION: Check if transaction hash already used
      const txAlreadyUsed = await isTxHashUsed(input.txHash);
      if (txAlreadyUsed) {
        console.log("[SECURITY] Replay attack detected - tx already used:", { txHash: input.txHash.slice(0, 20), poolId, wallet: input.walletAddress });
        return res.status(409).json({ message: "Transaction hash already used" });
      }

      // 🔐 SECURITY: Verify cancel_pool transaction on-chain
      const verification = await verifyCancelPoolTransaction(
        input.txHash,
        input.walletAddress,
        pool.poolAddress
      );

      if (!verification.valid) {
        console.log("[CANCEL_VERIFY] Transaction verification failed:", verification.reason);
        return res.status(400).json({
          message: verification.reason || "Transaction verification failed",
        });
      }

      console.log("[CANCEL_VERIFY] ✅ Verified cancel transaction:", {
        txHash: input.txHash.substring(0, 20) + "...",
        wallet: input.walletAddress.substring(0, 16) + "...",
      });

      // 🔐 ATOMIC TRANSACTION: Update status + mark tx as used
      const client = await pgPool.connect();

      try {
        await client.query("BEGIN");

        // Mark transaction as used
        await markTxHashUsed(input.txHash, poolId, input.walletAddress, "cancel");

        // Update pool status to cancelled
        await storage.updatePoolStatus(poolId, 'cancelled');

        // Record transaction
        await storage.addTransaction({
          poolId,
          walletAddress: input.walletAddress,
          type: 'CANCEL',
          amount: 0,
          txHash: input.txHash,
        });

        await client.query("COMMIT");
        client.release();

        // 📢 NOTIFY: Send CANCEL notification ONLY to participants (not creator)
        const cancelledPool = await storage.getPool(poolId);
        const cancelledPoolParticipants = await storage.getParticipants(poolId);

        if (cancelledPool && cancelledPoolParticipants && cancelledPoolParticipants.length > 0) {
          // Filter out the creator from participants list
          const participantsWithoutCreator = cancelledPoolParticipants.filter(
            p => p.walletAddress.toLowerCase() !== cancelledPool.creatorWallet.toLowerCase()
          );

          logger.info('[NOTIFICATIONS] CANCEL event - notifying participants (excluding creator)', {
            poolId: cancelledPool.id,
            totalParticipants: cancelledPoolParticipants.length,
            notifyingCount: participantsWithoutCreator.length,
            creator: cancelledPool.creatorWallet.slice(0, 8)
          });

          // Only notify if there are participants other than the creator
          if (participantsWithoutCreator.length > 0) {
            // Convert to format expected by notifyParticipantsOnly
            const participantsForNotification = participantsWithoutCreator.map(p => ({ wallet: p.walletAddress }));

            await notificationService.notifyParticipantsOnly(participantsForNotification, {
              type: NotificationType.CANCEL,
              title: 'Pool Cancelled',
              message: `${cancelledPool.tokenName} pool was cancelled by creator. You can claim your refund.`,
              poolId: cancelledPool.id,
              poolName: `${cancelledPool.tokenName} Pool`,
            });
          }
        }

        // 🗑️ DELETE CHAT: Clean up chat messages when pool is cancelled
        try {
          const deletedCount = await storage.deletePoolChatMessages(poolId);
          console.log(`[CHAT] Deleted ${deletedCount} chat messages for cancelled pool ${poolId}`);
        } catch (chatErr: any) {
          console.error(`[CHAT] Failed to delete chat messages for pool ${poolId}:`, chatErr);
        }

        res.json({ success: true, message: "Pool cancelled successfully" });
      } catch (err: any) {
        await client.query("ROLLBACK");
        client.release();

        if (err.message.includes("already used")) {
          console.log("[SECURITY] Race condition prevented by UNIQUE constraint:", { txHash: input.txHash.slice(0, 20) });
          return res.status(409).json({ message: "Transaction already processed" });
        }

        throw err;
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(400).json({ message: err.message });
    }
  });

  // Refund
  app.post("/api/pools/:id/refund", async (req, res) => {
    try {
      const poolId = parseInt(req.params.id);
      const input = z.object({
        walletAddress: z.string(),
        txHash: z.string(),
      }).parse(req.body);

      // Fetch pool to get poolAddress
      const pool = await storage.getPool(poolId);
      if (!pool) {
        return res.status(404).json({ message: "Pool not found" });
      }

      if (!pool.poolAddress) {
        return res.status(400).json({ message: "Pool has no on-chain address" });
      }

      // Validate txHash format
      if (!input.txHash.match(/^[1-9A-HJ-NP-Za-km-z]{87,88}$/)) {
        return res.status(400).json({ message: "Invalid transaction signature format" });
      }

      // 🔐 REPLAY PROTECTION: Check if transaction hash already used
      const txAlreadyUsed = await isTxHashUsed(input.txHash);
      if (txAlreadyUsed) {
        console.log("[SECURITY] Replay attack detected - tx already used:", { txHash: input.txHash.slice(0, 20), poolId, wallet: input.walletAddress });
        return res.status(409).json({ message: "Transaction hash already used" });
      }

      // 🔐 SECURITY: Verify refund transaction on-chain
      const verification = await verifyClaimRefundTransaction(
        input.txHash,
        input.walletAddress,
        pool.poolAddress
      );

      if (!verification.valid) {
        console.log("[REFUND_VERIFY] Transaction verification failed:", verification.reason);
        return res.status(400).json({
          message: verification.reason || "Transaction verification failed",
        });
      }

      console.log("[REFUND_VERIFY] ✅ Verified refund transaction:", {
        txHash: input.txHash.substring(0, 20) + "...",
        wallet: input.walletAddress.substring(0, 16) + "...",
      });

      // 🔐 ATOMIC TRANSACTION: Mark claimed + mark tx as used
      const client = await pgPool.connect();

      try {
        await client.query("BEGIN");

        // Mark transaction as used
        await markTxHashUsed(input.txHash, poolId, input.walletAddress, "refund");

        // Mark refund as claimed in database
        await storage.markRefundClaimed(poolId, input.walletAddress);

        // Record transaction
        await storage.addTransaction({
          poolId,
          walletAddress: input.walletAddress,
          type: 'REFUND',
          amount: pool.entryAmount,
          txHash: input.txHash,
        });

        await client.query("COMMIT");
        client.release();

        res.json({ success: true, message: "Refund claimed successfully" });
      } catch (err: any) {
        await client.query("ROLLBACK");
        client.release();

        if (err.message.includes("already used")) {
          console.log("[SECURITY] Race condition prevented by UNIQUE constraint:", { txHash: input.txHash.slice(0, 20) });
          return res.status(409).json({ message: "Transaction already processed" });
        }

        throw err;
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(400).json({ message: err.message });
    }
  });

  app.post(api.pools.donate.path, async (req, res) => {
    console.log("=== BACKEND_DONATE_RECEIVED ===");
    console.log("RAW_BODY:", JSON.stringify(req.body, null, 2));
    
    try {
      const id = Number(req.params.id);
      const input = z.object({ 
        walletAddress: z.string(), 
        amount: z.coerce.number(),
        txHash: z.string().optional() // On-chain transaction proof
      }).parse(req.body);
      
      const pool = await storage.getPool(id);
      if (!pool) return res.status(404).json({ message: "Pool not found" });
      if (pool.status === 'ended' || pool.status === 'cancelled') return res.status(400).json({ message: "Pool ended" });

      // Require txHash for real pools (pools with poolAddress)
      if (pool.poolAddress && !input.txHash) {
        console.log("[ANTI-FAKE] Rejected donate - missing txHash for on-chain pool");
        return res.status(400).json({ message: "Donate requires on-chain transaction signature" });
      }

      // Validate txHash format if provided
      if (input.txHash && !input.txHash.match(/^[1-9A-HJ-NP-Za-km-z]{87,88}$/)) {
        return res.status(400).json({ message: "Invalid transaction signature format" });
      }

      // 🔐 REPLAY PROTECTION: Check if transaction hash already used (for on-chain pools)
      if (pool.poolAddress && input.txHash) {
        const txAlreadyUsed = await isTxHashUsed(input.txHash);
        if (txAlreadyUsed) {
          console.log("[SECURITY] Replay attack detected - tx already used:", { txHash: input.txHash.slice(0, 20), poolId: id, wallet: input.walletAddress });
          return res.status(409).json({ message: "Transaction hash already used" });
        }
      }

      // 🔐 SECURITY FIX: Verify donate transaction on-chain (for on-chain pools)
      if (pool.poolAddress && input.txHash) {
        const verification = await verifyDonateTransaction(
          input.txHash,
          input.walletAddress,
          pool.poolAddress
        );

        if (!verification.valid) {
          console.log("[DONATE_VERIFY] Transaction verification failed:", verification.reason);
          return res.status(400).json({
            message: verification.reason || "Transaction verification failed"
          });
        }

        console.log("[DONATE_VERIFY] ✅ Verified on-chain donate:", {
          txHash: input.txHash.substring(0, 20) + "...",
          wallet: input.walletAddress.substring(0, 16) + "...",
          amount: input.amount
        });
      } else {
        console.log("[DONATE] Local pool donate (no verification required):", {
          wallet: input.walletAddress.substring(0, 16) + "...",
          amount: input.amount
        });
      }

      // 🔐 ATOMIC TRANSACTION: Add donation + mark tx as used (for on-chain pools)
      let tx;
      let updatedPool;

      if (pool.poolAddress && input.txHash) {
        const client = await pgPool.connect();

        try {
          await client.query("BEGIN");

          // Mark transaction as used
          await markTxHashUsed(input.txHash, id, input.walletAddress, "donate");

          // Add transaction
          tx = await storage.addTransaction({
            poolId: id,
            walletAddress: input.walletAddress,
            type: 'DONATE',
            amount: input.amount,
            txHash: input.txHash
          });

          await client.query("COMMIT");
          client.release();

          // Return updated pool data
          updatedPool = await storage.getPool(id);
        } catch (err: any) {
          await client.query("ROLLBACK");
          client.release();

          if (err.message.includes("already used")) {
            console.log("[SECURITY] Race condition prevented by UNIQUE constraint:", { txHash: input.txHash.slice(0, 20) });
            return res.status(409).json({ message: "Transaction already processed" });
          }

          throw err;
        }
      } else {
        // Local/mock pool - no replay protection needed
        tx = await storage.addTransaction({
          poolId: id,
          walletAddress: input.walletAddress,
          type: 'DONATE',
          amount: input.amount,
          txHash: input.txHash
        });

        updatedPool = await storage.getPool(id);
      }

      res.json({ transaction: tx, pool: updatedPool });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Demo Trigger Winner
  app.post(api.pools.triggerWinner.path, async (req, res) => {
    const id = Number(req.params.id);
    const pool = await storage.getPool(id);
    if (!pool) return res.status(404).json({ message: "Pool not found" });
    
    const participants = await storage.getParticipants(id);
    if (participants.length === 0) return res.status(400).json({ message: "No participants" });

    const winner = participants[Math.floor(Math.random() * participants.length)];
    const updated = await storage.updatePoolStatus(id, 'winnerSelected', winner.walletAddress);
    
    res.json({ winner: winner.walletAddress, payout: pool.totalPot });
  });

  // ============================================
  // NOTIFICATIONS
  // ============================================

  // GET /api/notifications/:walletAddress - Get notifications for a wallet
  app.get("/api/notifications/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const notifications = await storage.getNotifications(walletAddress, limit);
      res.json({ notifications });
    } catch (err: any) {
      console.error("[NOTIFICATIONS] Failed to get notifications:", err);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  // GET /api/notifications/:walletAddress/unread-count - Get unread count
  app.get("/api/notifications/:walletAddress/unread-count", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      const count = await storage.getUnreadCount(walletAddress);
      res.json({ count });
    } catch (err: any) {
      console.error("[NOTIFICATIONS] Failed to get unread count:", err);
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  // POST /api/notifications/:id/mark-read - Mark notification as read
  app.post("/api/notifications/:id/mark-read", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { walletAddress } = req.body;

      if (!walletAddress) {
        return res.status(400).json({ message: "walletAddress required" });
      }

      const success = await storage.markNotificationAsRead(id, walletAddress);
      res.json({ success });
    } catch (err: any) {
      console.error("[NOTIFICATIONS] Failed to mark as read:", err);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // POST /api/notifications/:walletAddress/mark-all-read - Mark all as read
  app.post("/api/notifications/:walletAddress/mark-all-read", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      const count = await storage.markAllNotificationsAsRead(walletAddress);
      res.json({ count });
    } catch (err: any) {
      console.error("[NOTIFICATIONS] Failed to mark all as read:", err);
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  // DELETE /api/notifications/:id - Delete a notification
  app.delete("/api/notifications/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { walletAddress } = req.body;

      if (!walletAddress) {
        return res.status(400).json({ message: "walletAddress required" });
      }

      const success = await storage.deleteNotification(id, walletAddress);
      res.json({ success });
    } catch (err: any) {
      console.error("[NOTIFICATIONS] Failed to delete notification:", err);
      res.status(500).json({ message: "Failed to delete notification" });
    }
  });

  // DELETE /api/notifications/:walletAddress/all - Delete all notifications for wallet
  app.delete("/api/notifications/:walletAddress/all", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      const count = await storage.deleteAllNotifications(walletAddress);
      res.json({ count });
    } catch (err: any) {
      console.error("[NOTIFICATIONS] Failed to delete all notifications:", err);
      res.status(500).json({ message: "Failed to delete all notifications" });
    }
  });

  // ============================================
  // POOL CHAT
  // ============================================

  // GET /api/pools/:poolId/chat - Get chat messages for a pool
  app.get("/api/pools/:poolId/chat", async (req, res) => {
    try {
      const poolId = parseInt(req.params.poolId);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

      const messages = await storage.getChatMessages(poolId, limit);
      res.json({ messages });
    } catch (err: any) {
      console.error("[CHAT] Failed to get messages:", err);
      res.status(500).json({ message: "Failed to fetch chat messages" });
    }
  });

  // POST /api/pools/:poolId/chat - Send a chat message
  app.post("/api/pools/:poolId/chat", async (req, res) => {
    try {
      const poolId = parseInt(req.params.poolId);
      const { walletAddress, message } = req.body;

      if (!walletAddress || !message) {
        return res.status(400).json({ message: "walletAddress and message required" });
      }

      if (message.trim().length === 0) {
        return res.status(400).json({ message: "Message cannot be empty" });
      }

      if (message.length > 500) {
        return res.status(400).json({ message: "Message too long (max 500 characters)" });
      }

      // Verify pool exists and is not ended/cancelled
      const pool = await storage.getPool(poolId);
      if (!pool) {
        return res.status(404).json({ message: "Pool not found" });
      }

      if (pool.status === 'ended' || pool.status === 'cancelled') {
        return res.status(400).json({ message: "Cannot send messages to ended/cancelled pools" });
      }

      const chatMessage = await storage.createChatMessage({
        poolId,
        walletAddress: walletAddress.toLowerCase(),
        message: message.trim(),
      });

      // Broadcast message via WebSocket
      notificationService.broadcastChatMessage(poolId, chatMessage);

      res.json(chatMessage);
    } catch (err: any) {
      console.error("[CHAT] Failed to send message:", err);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Leaderboard
  app.get(api.leaderboard.get.path, cacheMiddleware({ ttl: 60 }), async (req, res) => {
    const data = await storage.getLeaderboard();
    res.json(data);
  });

  // Detailed leaderboard endpoints
  app.get(api.leaderboard.winners.path, cacheMiddleware({ ttl: 60 }), async (req, res) => {
    try {
      const pagination = parsePaginationParams(req);
      const { winners, total } = await storage.getTopWinners(pagination.limit, pagination.offset);

      const response = createPaginatedResponse(
        winners.map(w => ({
          ...w,
          lastWinAt: w.lastWinAt ? (typeof w.lastWinAt === 'string' ? w.lastWinAt : new Date(w.lastWinAt).toISOString()) : null,
        })),
        total,
        pagination
      );

      res.json(response);
    } catch (error) {
      console.error("Error fetching top winners:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  app.get(api.leaderboard.referrers.path, cacheMiddleware({ ttl: 60 }), async (req, res) => {
    try {
      const pagination = parsePaginationParams(req);
      const { referrers, total } = await storage.getTopReferrers(pagination.limit, pagination.offset);

      const response = createPaginatedResponse(
        referrers.map(r => ({
          ...r,
          firstReferralAt: r.firstReferralAt ? (typeof r.firstReferralAt === 'string' ? r.firstReferralAt : new Date(r.firstReferralAt).toISOString()) : null,
          lastReferralAt: r.lastReferralAt ? (typeof r.lastReferralAt === 'string' ? r.lastReferralAt : new Date(r.lastReferralAt).toISOString()) : null,
        })),
        total,
        pagination
      );

      res.json(response);
    } catch (error) {
      console.error("Error fetching top referrers:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  // Token Discovery API
  app.get("/api/discovery/tokens", cacheMiddleware({ ttl: 120 }), async (req, res) => {
    try {
      const pagination = parsePaginationParams(req);
      const allTokens = await tokenDiscoveryService.getTokens();
      const stats = tokenDiscoveryService.getCacheStats();

      // Apply pagination to tokens
      const paginatedTokens = paginateArray(allTokens, pagination);

      res.json({
        ...paginatedTokens,
        lastRefresh: stats.lastRefresh,
        isRefreshing: stats.isRefreshing,
        tokenCount: stats.tokenCount
      });
    } catch (err) {
      console.error("[routes] Token discovery error:", err);
      res.status(500).json({ message: "Failed to fetch tokens" });
    }
  });

  app.get("/api/discovery/tokens/search", async (req, res) => {
    const mintAddress = req.query.mint as string;
    if (!mintAddress) {
      return res.status(400).json({ message: "Missing mint parameter" });
    }
    
    try {
      const token = await tokenDiscoveryService.searchToken(mintAddress);
      if (!token) {
        return res.status(404).json({ message: "Token not found" });
      }
      res.json(token);
    } catch (err) {
      res.status(500).json({ message: "Search failed" });
    }
  });

  app.get("/api/discovery/stats", cacheMiddleware({ ttl: 30 }), (req, res) => {
    const stats = tokenDiscoveryService.getCacheStats();
    res.json(stats);
  });

  // Start background refresh for token discovery
  tokenDiscoveryService.startBackgroundRefresh(10000);

  // Pool Monitor API
  app.get("/api/monitor/status", (req, res) => {
    res.json(poolMonitor.getStatus());
  });

  app.post("/api/monitor/start", (req, res) => {
    poolMonitor.start();
    res.json({ message: "Pool monitor started", status: poolMonitor.getStatus() });
  });

  app.post("/api/monitor/stop", (req, res) => {
    poolMonitor.stop();
    res.json({ message: "Pool monitor stopped", status: poolMonitor.getStatus() });
  });

  // Start pool monitor
  poolMonitor.start();

  // Development only - Reset pools
  if (process.env.NODE_ENV === "development") {
    app.post("/api/dev/reset-pools", async (req, res) => {
      try {
        await db.delete(pools);
        res.json({ success: true, message: "All pools deleted" });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  // Profile Routes
  const shortenWallet = (wallet: string) => `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
  const generateDicebearAvatar = (wallet: string, style: string = "bottts") => 
    `https://api.dicebear.com/7.x/${style}/svg?seed=${wallet}`;

  app.get(api.profiles.get.path, cacheMiddleware({ ttl: 300 }), async (req, res) => {
    const wallet = req.params.wallet;
    const normalizedWallet = wallet.toLowerCase(); // Normalize to lowercase for DB lookup

    try {
      const profile = await storage.getProfile(normalizedWallet);

      const displayName = profile?.nickname || shortenWallet(wallet);
      const displayAvatar = profile?.avatarUrl || generateDicebearAvatar(wallet, profile?.avatarStyle || "bottts");

      res.json({
        walletAddress: wallet,
        nickname: profile?.nickname || null,
        avatarUrl: profile?.avatarUrl || null,
        avatarStyle: profile?.avatarStyle || null,
        displayName,
        displayAvatar
      });
    } catch (err) {
      console.error("[Profile] Get error:", err);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.get(api.profiles.getNonce.path, async (req, res) => {
    const wallet = req.params.wallet;
    
    try {
      const nonce = await storage.getOrCreateNonce(wallet);
      const message = `MissOut Profile Update\n\nNonce: ${nonce}\nWallet: ${wallet}\n\nSign this message to verify your identity.`;
      
      res.json({ nonce, message });
    } catch (err) {
      console.error("[Profile] Nonce error:", err);
      res.status(500).json({ message: "Failed to generate nonce" });
    }
  });

  app.post(api.profiles.update.path, async (req, res) => {
    const wallet = req.params.wallet;
    
    try {
      const input = updateProfileSchema.parse(req.body);
      
      const profile = await storage.getProfile(wallet);
      
      if (input.nickname) {
        const cooldown = await storage.checkNicknameCooldown(wallet);
        if (!cooldown.canChange && profile?.nickname !== input.nickname) {
          const message = profile?.nicknameChangeCount && profile.nicknameChangeCount >= 2
            ? "Nickname can only be changed once every 48 hours"
            : "Nickname can only be changed once per week";
            
          return res.status(429).json({ 
            message,
            cooldownEnds: cooldown.cooldownEnds?.toISOString()
          });
        }
        
        const available = await storage.isNicknameAvailable(input.nickname, wallet);
        if (!available) {
          return res.status(400).json({ message: "Nickname already taken", field: "nickname" });
        }
      }
      
      const updated = await storage.updateProfile(wallet, {
        nickname: input.nickname,
        avatarUrl: input.avatarUrl ?? undefined,
        avatarStyle: input.avatarStyle ?? undefined
      });

      // Invalidate profile cache
      await invalidateCache(`api:GET:/api/profile/${wallet}*`);

      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      console.error("[Profile] Update error:", err);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.get(api.profiles.transactions.path, async (req, res) => {
    const wallet = req.params.wallet;
    try {
      const pagination = parsePaginationParams(req);
      const allTxs = await storage.getWalletTransactions(wallet);

      // Apply pagination
      const paginatedTxs = paginateArray(allTxs, pagination);

      res.json(paginatedTxs);
    } catch (err) {
      console.error("[Profile] Transactions error:", err);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // ============================================
  // REFERRAL SYSTEM ROUTES
  // ============================================

  app.get("/api/referrals/link/:wallet", async (req, res) => {
    const wallet = req.params.wallet;
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "https://missout.app";
    
    const referralLink = `${baseUrl}?ref=${wallet}`;
    res.json({ link: referralLink, wallet });
  });

  app.post("/api/referrals/register", async (req, res) => {
    try {
      const { referredWallet, referrerWallet, source } = req.body;
      
      if (!referredWallet || !referrerWallet) {
        return res.status(400).json({ message: "Missing wallet addresses" });
      }

      if (referredWallet === referrerWallet) {
        return res.status(400).json({ message: "Cannot refer yourself" });
      }

      const existing = await storage.getReferralRelation(referredWallet);
      if (existing) {
        return res.json({ 
          success: false, 
          message: "Already has a referrer",
          referrer: existing.referrerWallet
        });
      }

      const relation = await storage.createReferralRelation(referredWallet, referrerWallet, source || "link");
      
      if (relation) {
        res.json({ success: true, relation });
      } else {
        res.status(400).json({ success: false, message: "Failed to create referral" });
      }
    } catch (err) {
      console.error("[Referral] Register error:", err);
      res.status(500).json({ message: "Failed to register referral" });
    }
  });

  app.get("/api/referrals/check/:wallet", async (req, res) => {
    const wallet = req.params.wallet;
    const relation = await storage.getReferralRelation(wallet);
    res.json({ 
      hasReferrer: !!relation,
      referrer: relation?.referrerWallet || null
    });
  });

  app.get("/api/referrals/summary/:wallet", async (req, res) => {
    try {
      const wallet = req.params.wallet;
      const stats = await storage.getReferralStats(wallet);

      // Get detailed rewards breakdown by token
      const allRewards = await storage.getReferralRewards(wallet);

      // Group rewards by token and calculate claimable amounts
      const rewardsByToken = allRewards.map(reward => {
        const pendingBigInt = BigInt(reward.amountPending || "0");
        const claimedBigInt = BigInt(reward.amountClaimed || "0");
        const totalBigInt = pendingBigInt + claimedBigInt;

        // IMPORTANT: Amounts are stored in lamports (smallest unit, 10^9 for SOL)
        // Convert to human-readable format (assumes 9 decimals for all tokens)
        const DECIMALS = 9;
        const DECIMAL_DIVISOR = BigInt(10 ** DECIMALS);

        return {
          tokenMint: reward.tokenMint,
          // Raw amounts in lamports (for contract interaction)
          amountPending: reward.amountPending || "0",
          amountClaimed: reward.amountClaimed || "0",
          totalEarned: totalBigInt.toString(),
          // Human-readable amounts (for display)
          amountPendingDisplay: (Number(pendingBigInt) / Number(DECIMAL_DIVISOR)).toFixed(DECIMALS),
          amountClaimedDisplay: (Number(claimedBigInt) / Number(DECIMAL_DIVISOR)).toFixed(DECIMALS),
          totalEarnedDisplay: (Number(totalBigInt) / Number(DECIMAL_DIVISOR)).toFixed(DECIMALS),
          // Metadata
          decimals: DECIMALS,
          isClaimable: pendingBigInt > BigInt(0),
        };
      });

      // Add rewards breakdown to stats
      const enhancedStats = {
        ...stats,
        rewardsByToken, // Array of rewards per token with claimable amounts
        totalPendingRewards: allRewards.reduce((sum, r) => sum + BigInt(r.amountPending || "0"), BigInt(0)).toString(),
      };

      res.json(enhancedStats);
    } catch (err) {
      console.error("[Referral] Summary error:", err);
      res.status(500).json({ message: "Failed to fetch referral summary" });
    }
  });

  app.get("/api/referrals/rewards/:wallet", async (req, res) => {
    try {
      const wallet = req.params.wallet;
      const pagination = parsePaginationParams(req);
      const allRewards = await storage.getReferralRewards(wallet);

      // Format rewards with proper numeric values and claimable status
      const formattedRewards = allRewards.map(reward => {
        const pendingBigInt = BigInt(reward.amountPending || "0");
        const claimedBigInt = BigInt(reward.amountClaimed || "0");
        const totalBigInt = pendingBigInt + claimedBigInt;

        // IMPORTANT: Amounts are stored in lamports (smallest unit, 10^9 for SOL)
        // Convert to human-readable format (assumes 9 decimals for all tokens)
        const DECIMALS = 9;
        const DECIMAL_DIVISOR = BigInt(10 ** DECIMALS);

        return {
          id: reward.id,
          referrerWallet: reward.referrerWallet,
          tokenMint: reward.tokenMint,
          // Raw amounts in lamports (for contract interaction)
          amountPending: reward.amountPending || "0",
          amountClaimed: reward.amountClaimed || "0",
          totalEarned: totalBigInt.toString(),
          // Human-readable amounts (for display)
          amountPendingDisplay: (Number(pendingBigInt) / Number(DECIMAL_DIVISOR)).toFixed(DECIMALS),
          amountClaimedDisplay: (Number(claimedBigInt) / Number(DECIMAL_DIVISOR)).toFixed(DECIMALS),
          totalEarnedDisplay: (Number(totalBigInt) / Number(DECIMAL_DIVISOR)).toFixed(DECIMALS),
          // Metadata
          decimals: DECIMALS,
          isClaimable: pendingBigInt > BigInt(0),
          lastUpdated: reward.lastUpdated,
          lastClaimTimestamp: reward.lastClaimTimestamp,
        };
      });

      // Apply pagination
      const paginatedRewards = paginateArray(formattedRewards, pagination);

      res.json(paginatedRewards);
    } catch (err) {
      console.error("[Referral] Rewards error:", err);
      res.status(500).json({ message: "Failed to fetch rewards" });
    }
  });

  app.get("/api/referrals/invited/:wallet", async (req, res) => {
    try {
      const wallet = req.params.wallet;
      const pagination = parsePaginationParams(req);
      const allInvited = await storage.getInvitedUsers(wallet);

      // Apply pagination
      const paginatedInvited = paginateArray(allInvited, pagination);

      res.json(paginatedInvited);
    } catch (err) {
      console.error("[Referral] Invited error:", err);
      res.status(500).json({ message: "Failed to fetch invited users" });
    }
  });

  app.post("/api/referrals/claim", async (req, res) => {
    try {
      const { wallet, tokenMint, signature, message } = req.body;
      
      if (!wallet || !tokenMint || !signature || !message) {
        return res.status(400).json({ message: "Missing required fields (wallet, tokenMint, signature, message)" });
      }

      // Verify the wallet signature to prove ownership
      try {
        const publicKeyBytes = bs58.decode(wallet);
        const signatureBytes = bs58.decode(signature);
        const messageBytes = new TextEncoder().encode(message);
        
        const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
        
        if (!isValid) {
          console.log("[Referral] Claim rejected - invalid signature for wallet:", wallet);
          return res.status(401).json({ success: false, message: "Invalid signature. Please sign again." });
        }
        
        // Verify the message contains the expected claim data and parse timestamp
        const expectedPrefix = `Claim referral rewards for ${tokenMint} at `;
        if (!message.startsWith(expectedPrefix)) {
          console.log("[Referral] Claim rejected - message mismatch:", message);
          return res.status(401).json({ success: false, message: "Invalid claim message format." });
        }
        
        // Extract and validate timestamp to prevent replay attacks
        const timestampStr = message.substring(expectedPrefix.length);
        const timestamp = parseInt(timestampStr, 10);
        
        if (isNaN(timestamp)) {
          console.log("[Referral] Claim rejected - invalid timestamp:", timestampStr);
          return res.status(401).json({ success: false, message: "Invalid claim timestamp." });
        }
        
        const now = Date.now();
        const maxAge = 60 * 1000; // 60 seconds
        
        if (now - timestamp > maxAge) {
          console.log("[Referral] Claim rejected - expired signature, age:", now - timestamp, "ms");
          return res.status(401).json({ success: false, message: "Signature expired. Please sign again." });
        }
        
        if (timestamp > now + 5000) { // Allow 5 seconds clock skew
          console.log("[Referral] Claim rejected - future timestamp:", timestamp);
          return res.status(401).json({ success: false, message: "Invalid timestamp." });
        }
        
        console.log("[Referral] Signature verified for wallet:", wallet, "age:", now - timestamp, "ms");
        
        // Pass timestamp to atomic claim function for replay protection
        const result = await storage.claimReferralReward(wallet, tokenMint, timestamp);
        
        if (result.success) {
          res.json({ 
            success: true, 
            amount: result.amount,
            message: "Claim initiated. Tokens will be sent to your wallet."
          });
        } else {
          res.status(400).json({ success: false, message: result.error });
        }
        return;
      } catch (sigErr) {
        console.error("[Referral] Signature verification error:", sigErr);
        return res.status(401).json({ success: false, message: "Signature verification failed." });
      }
    } catch (err) {
      console.error("[Referral] Claim error:", err);
      res.status(500).json({ message: "Failed to process claim" });
    }
  });

  // ============================================
  // WINNERS FEED
  // ============================================

  app.get(api.winners.feed.path, cacheMiddleware({ ttl: 5 }), async (req, res) => {
    try {
      const winners = await storage.getRecentWinners(15);
      res.json(winners);
    } catch (err) {
      console.error("[Winners Feed] Error:", err);
      res.status(500).json({ message: "Failed to fetch winners feed" });
    }
  });

  return httpServer;
}

// Seed function
export async function seedDatabase() {
  // Seed database function disabled - pools should only be created by users on-chain
  // No automatic BONK or SOL pools will be created
  console.log("[seedDatabase] Skipping - auto-seeding disabled");
}

