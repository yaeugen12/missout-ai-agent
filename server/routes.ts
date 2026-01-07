import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import { tokenDiscoveryService, type DiscoveredToken } from "./tokenDiscoveryService";
import { poolMonitor } from "./pool-monitor";
import { db } from "./db";
import { pools, updateProfileSchema } from "@shared/schema";
import nacl from "tweetnacl";
import bs58 from "bs58";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { Connection, PublicKey } from "@solana/web3.js";

// ===========================================
// SECURITY: On-Chain Transaction Verification
// ===========================================
const solanaConnection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);

// MissOut Program ID
const MISSOUT_PROGRAM_ID = "53oTPbfy559uTaJQAbuWeAN1TyWXK1KfxUsM2GPJtrJw";

// Anchor instruction discriminators (first 8 bytes of sha256("global:instruction_name"))
// These are pre-computed for claim_refund and claim_rent instructions
// claim_refund: sha256("global:claim_refund")[0..8] = [143, 160, 32, 23, 17, 97, 156, 101]
// claim_rent: sha256("global:claim_rent")[0..8] = [215, 25, 159, 196, 195, 68, 217, 41]
const CLAIM_REFUND_DISCRIMINATOR = [143, 160, 32, 23, 17, 97, 156, 101];
const CLAIM_RENT_DISCRIMINATOR = [215, 25, 159, 196, 195, 68, 217, 41];

/**
 * Check if instruction data starts with the expected discriminator
 */
function matchesDiscriminator(data: Buffer | Uint8Array, discriminator: number[]): boolean {
  if (data.length < 8) return false;
  for (let i = 0; i < 8; i++) {
    if (data[i] !== discriminator[i]) return false;
  }
  return true;
}

/**
 * Verify a transaction exists on-chain, succeeded, invoked our program
 * with the correct claim instruction, and involves the expected wallet and pool.
 * 
 * SECURITY: This prevents attackers from reusing unrelated transactions
 * (like join/donate transactions) to fake claims.
 */
async function verifyOnChainClaimTransaction(
  txHash: string, 
  expectedWallet: string,
  claimType: "refund" | "rent",
  expectedPoolAddress?: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const tx = await solanaConnection.getTransaction(txHash, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx) {
      return { valid: false, error: "Transaction not found on-chain" };
    }
    
    if (tx.meta?.err) {
      return { valid: false, error: "Transaction failed on-chain" };
    }
    
    // Get all account keys including loaded addresses for versioned transactions
    const staticKeys = tx.transaction.message.staticAccountKeys.map(k => k.toBase58());
    const loadedWritable = tx.meta?.loadedAddresses?.writable?.map(k => k.toBase58()) || [];
    const loadedReadonly = tx.meta?.loadedAddresses?.readonly?.map(k => k.toBase58()) || [];
    const allAccountKeys = [...staticKeys, ...loadedWritable, ...loadedReadonly];
    
    // Determine which discriminator to check based on claim type
    const expectedDiscriminator = claimType === "refund" 
      ? CLAIM_REFUND_DISCRIMINATOR 
      : CLAIM_RENT_DISCRIMINATOR;
    
    // SECURITY: Verify the transaction contains a claim instruction with correct discriminator
    // Check compiled instructions in the message
    const compiledInstructions = tx.transaction.message.compiledInstructions;
    let foundClaimInstruction = false;
    
    for (const ix of compiledInstructions) {
      const programId = allAccountKeys[ix.programIdIndex];
      if (programId === MISSOUT_PROGRAM_ID) {
        // Check if instruction data matches the expected claim discriminator
        if (matchesDiscriminator(ix.data, expectedDiscriminator)) {
          foundClaimInstruction = true;
          break;
        }
      }
    }
    
    // Also check inner instructions (CPI calls)
    if (!foundClaimInstruction && tx.meta?.innerInstructions) {
      for (const inner of tx.meta.innerInstructions) {
        for (const ix of inner.instructions as any[]) {
          const programId = allAccountKeys[ix.programIdIndex];
          if (programId === MISSOUT_PROGRAM_ID) {
            const data = bs58.decode(ix.data);
            if (matchesDiscriminator(data, expectedDiscriminator)) {
              foundClaimInstruction = true;
              break;
            }
          }
        }
        if (foundClaimInstruction) break;
      }
    }
    
    if (!foundClaimInstruction) {
      return { valid: false, error: `No claim_${claimType} instruction found in transaction` };
    }
    
    // Check if the expected wallet is in the transaction
    if (!allAccountKeys.includes(expectedWallet)) {
      return { valid: false, error: "Wallet not found in transaction" };
    }
    
    // If pool address provided, verify it's in the transaction
    if (expectedPoolAddress && !allAccountKeys.includes(expectedPoolAddress)) {
      return { valid: false, error: "Pool address not found in transaction" };
    }
    
    // Verify the wallet signed the transaction
    const numSignatures = tx.transaction.signatures.length;
    const signerKeys = staticKeys.slice(0, numSignatures);
    if (!signerKeys.includes(expectedWallet)) {
      return { valid: false, error: "Wallet did not sign this transaction" };
    }
    
    return { valid: true };
  } catch (err: any) {
    console.error("[SECURITY] On-chain verification error:", err.message);
    return { valid: false, error: "Failed to verify transaction on-chain" };
  }
}

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

// Sanitize filename to prevent path traversal and injection attacks
function sanitizeFilename(originalName: string): string {
  // Remove path components
  const basename = path.basename(originalName);
  // Remove dangerous characters, keep only alphanumeric, dots, underscores, hyphens
  const sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, '');
  // Ensure extension is valid
  const ext = path.extname(sanitized).toLowerCase();
  if (!ALLOWED_IMAGE_TYPES[ext]) {
    return ''; // Invalid extension
  }
  return sanitized;
}

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
  // Upload Endpoint with security validation
  app.post("/api/upload", upload.single('file'), async (req, res) => {
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

    const publicUrl = `/uploads/${req.file.filename}`;
    console.log("[UPLOAD] Accepted file:", req.file.filename);
    res.json({ url: publicUrl });
  });
  // Pools
  app.get(api.pools.list.path, async (req, res) => {
    const pools = await storage.getPools();
    res.json(pools);
  });

  app.get("/api/pools/claimable", async (req, res) => {
    try {
      const wallet = req.query.wallet as string;
      if (!wallet) {
        return res.status(400).json({ message: "Wallet address required" });
      }
      
      const allPools = await storage.getPools();
      
      const refunds: any[] = [];
      const rents: any[] = [];
      
      for (const pool of allPools) {
        const participants = await storage.getParticipants(pool.id);

        const poolData = {
          id: pool.id,
          onChainAddress: pool.poolAddress, // Map poolAddress from DB to onChainAddress for frontend
          status: pool.status,
          tokenMint: pool.tokenMint,
          tokenSymbol: pool.tokenSymbol,
          tokenLogoUrl: undefined, // Token logo can be fetched from token metadata if needed
          entryFee: pool.entryAmount.toString(), // Use entryAmount from DB, convert to string for frontend
          creatorWallet: pool.creatorWallet,
          participants: participants.map(p => p.walletAddress),
        };

        // Check if user can claim refund (pool cancelled, user is participant, refund not yet claimed)
        if (pool.status === "cancelled") {
          const userParticipant = participants.find(p => p.walletAddress === wallet);
          if (userParticipant && !userParticipant.refundClaimed) {
            refunds.push(poolData);
          }
        }

        // Check if creator can claim rent (pool ended/cancelled, rent not yet claimed)
        if (
          pool.creatorWallet === wallet &&
          ["ended", "cancelled"].includes(pool.status) &&
          !pool.rentClaimed
        ) {
          rents.push(poolData);
        }
      }
      
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

      // SECURITY: Verify transaction contains actual claim_refund instruction
      const onChainVerification = await verifyOnChainClaimTransaction(txHash, wallet, "refund", pool.poolAddress || undefined);
      if (!onChainVerification.valid) {
        console.log("[SECURITY] Claim refund rejected - on-chain verification failed:", onChainVerification.error);
        return res.status(400).json({ message: onChainVerification.error || "Transaction verification failed" });
      }

      // Verify participant exists and hasn't already claimed
      const participantsList = await storage.getParticipants(poolId);
      const participant = participantsList.find(p => p.walletAddress === wallet);
      
      if (!participant) {
        return res.status(404).json({ message: "Participant not found in this pool" });
      }
      
      if (participant.refundClaimed) {
        return res.status(409).json({ message: "Refund already claimed" });
      }

      const result = await storage.markRefundClaimed(poolId, wallet);

      if (!result) {
        return res.status(404).json({ message: "Participant not found" });
      }

      console.log("[CLAIM] Refund marked as claimed (on-chain verified):", { poolId, wallet, txHash: txHash.substring(0, 20) + "..." });
      res.json({ success: true });
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

      if (pool.creatorWallet !== wallet) {
        console.log("[SECURITY] Claim rent rejected - not creator:", { wallet, creator: pool.creatorWallet });
        return res.status(403).json({ message: "Only pool creator can claim rent" });
      }

      if (pool.rentClaimed) {
        return res.status(409).json({ message: "Rent already claimed" });
      }

      // SECURITY: Verify transaction contains actual claim_rent instruction
      const onChainVerification = await verifyOnChainClaimTransaction(txHash, wallet, "rent", pool.poolAddress || undefined);
      if (!onChainVerification.valid) {
        console.log("[SECURITY] Claim rent rejected - on-chain verification failed:", onChainVerification.error);
        return res.status(400).json({ message: onChainVerification.error || "Transaction verification failed" });
      }

      const result = await storage.markRentClaimed(poolId);

      if (!result) {
        return res.status(404).json({ message: "Pool not found" });
      }

      console.log("[CLAIM] Rent marked as claimed (verified):", { poolId, wallet, txHash: txHash.substring(0, 20) + "..." });
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking rent as claimed:", error);
      res.status(500).json({ message: "Failed to mark rent as claimed" });
    }
  });

  app.get(api.pools.get.path, async (req, res) => {
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
      
      console.log("[POOL CREATE] Valid on-chain pool:", {
        txHash: input.txHash.substring(0, 20) + "...",
        poolAddress: input.poolAddress
      });
      
      const pool = await storage.createPool(input);

      // A) CREATOR MUST ALWAYS BE FIRST PARTICIPANT
      console.log("[POOL CREATE] Adding creator as first participant:", input.creatorWallet);
      await storage.addParticipant({
        poolId: pool.id,
        walletAddress: input.creatorWallet,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${input.creatorWallet}`
      });

      // Add transaction record for creator (CREATE)
      await storage.addTransaction({
        poolId: pool.id,
        walletAddress: input.creatorWallet,
        type: 'CREATE',
        amount: pool.entryAmount,
        txHash: input.txHash
      });

      res.status(201).json(pool);
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

      console.log("[JOIN] Valid join:", { txHash: input.txHash?.substring(0, 20) + "...", wallet: input.walletAddress });

      let participant;
      try {
        participant = await storage.addParticipant({
          poolId: id,
          walletAddress: input.walletAddress,
          avatar: input.avatar,
          txHash: input.txHash // Save txHash to participant record
        });
      } catch (err: any) {
        // SECURITY: Handle duplicate participant error
        if (err.message?.includes("DUPLICATE_PARTICIPANT")) {
          console.log("[SECURITY] Blocked duplicate join attempt:", input.walletAddress);
          return res.status(409).json({ message: "You have already joined this pool" });
        }
        throw err;
      }

      // Add join transaction
      await storage.addTransaction({
        poolId: id,
        walletAddress: input.walletAddress,
        type: 'JOIN',
        amount: pool.entryAmount,
        txHash: input.txHash
      });

      // Return updated pool data
      const updatedPool = await storage.getPool(id);
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
      const { walletAddress, txHash } = req.body;

      await storage.addTransaction({
        poolId,
        walletAddress,
        type: 'CANCEL',
        amount: 0,
        txHash
      });

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Refund
  app.post("/api/pools/:id/refund", async (req, res) => {
    try {
      const poolId = parseInt(req.params.id);
      const { walletAddress, txHash } = req.body;

      await storage.addTransaction({
        poolId,
        walletAddress,
        type: 'REFUND',
        amount: 0,
        txHash
      });

      res.json({ success: true });
    } catch (err: any) {
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

      console.log("[DONATE] Valid donate:", { txHash: input.txHash?.substring(0, 20) + "...", amount: input.amount });

      const tx = await storage.addTransaction({
        poolId: id,
        walletAddress: input.walletAddress,
        type: 'DONATE',
        amount: input.amount,
        txHash: input.txHash
      });

      // Return updated pool data
      const updatedPool = await storage.getPool(id);
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

  // Leaderboard
  app.get(api.leaderboard.get.path, async (req, res) => {
    const data = await storage.getLeaderboard();
    res.json(data);
  });

  // Detailed leaderboard endpoints
  app.get(api.leaderboard.winners.path, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const winners = await storage.getTopWinners(Math.min(limit, 100));
      res.json(winners.map(w => ({
        ...w,
        lastWinAt: w.lastWinAt ? (typeof w.lastWinAt === 'string' ? w.lastWinAt : new Date(w.lastWinAt).toISOString()) : null,
      })));
    } catch (error) {
      console.error("Error fetching top winners:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  app.get(api.leaderboard.referrers.path, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const referrers = await storage.getTopReferrers(Math.min(limit, 100));
      res.json(referrers.map(r => ({
        ...r,
        firstReferralAt: r.firstReferralAt ? (typeof r.firstReferralAt === 'string' ? r.firstReferralAt : new Date(r.firstReferralAt).toISOString()) : null,
        lastReferralAt: r.lastReferralAt ? (typeof r.lastReferralAt === 'string' ? r.lastReferralAt : new Date(r.lastReferralAt).toISOString()) : null,
      })));
    } catch (error) {
      console.error("Error fetching top referrers:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  // Token Discovery API
  app.get("/api/discovery/tokens", async (req, res) => {
    try {
      const tokens = await tokenDiscoveryService.getTokens();
      const stats = tokenDiscoveryService.getCacheStats();
      res.json({
        tokens,
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

  app.get("/api/discovery/stats", (req, res) => {
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

  app.get(api.profiles.get.path, async (req, res) => {
    const wallet = req.params.wallet;
    
    try {
      const profile = await storage.getProfile(wallet);
      
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
        avatarUrl: input.avatarUrl,
        avatarStyle: input.avatarStyle
      });
      
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
      const txs = await storage.getWalletTransactions(wallet);
      res.json(txs);
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
      res.json(stats);
    } catch (err) {
      console.error("[Referral] Summary error:", err);
      res.status(500).json({ message: "Failed to fetch referral summary" });
    }
  });

  app.get("/api/referrals/rewards/:wallet", async (req, res) => {
    try {
      const wallet = req.params.wallet;
      const rewards = await storage.getReferralRewards(wallet);
      res.json(rewards);
    } catch (err) {
      console.error("[Referral] Rewards error:", err);
      res.status(500).json({ message: "Failed to fetch rewards" });
    }
  });

  app.get("/api/referrals/invited/:wallet", async (req, res) => {
    try {
      const wallet = req.params.wallet;
      const invited = await storage.getInvitedUsers(wallet);
      res.json(invited);
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

  return httpServer;
}

// Seed function
export async function seedDatabase() {
  // Seed database function disabled - pools should only be created by users on-chain
  // No automatic BONK or SOL pools will be created
  console.log("[seedDatabase] Skipping - auto-seeding disabled");
}

