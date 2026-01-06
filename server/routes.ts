import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import { tokenDiscoveryService, type DiscoveredToken } from "./tokenDiscoveryService";
import { poolMonitor } from "./pool-monitor";
import { db } from "./db";
import { pools } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Pools
  app.get(api.pools.list.path, async (req, res) => {
    const pools = await storage.getPools();
    res.json(pools);
  });

  app.get(api.pools.get.path, async (req, res) => {
    const id = Number(req.params.id);
    const pool = await storage.getPool(id);
    if (!pool) return res.status(404).json({ message: "Pool not found" });
    
    const participants = await storage.getParticipants(id);
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

      // Add transaction record for creator
      await storage.addTransaction({
        poolId: pool.id,
        walletAddress: input.creatorWallet,
        type: 'JOIN',
        amount: pool.entryAmount
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

      const participant = await storage.addParticipant({
        poolId: id,
        walletAddress: input.walletAddress,
        avatar: input.avatar
      });

      // Add join transaction
      await storage.addTransaction({
        poolId: id,
        walletAddress: input.walletAddress,
        type: 'JOIN',
        amount: pool.entryAmount
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
        amount: input.amount
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

  return httpServer;
}

// Seed function
export async function seedDatabase() {
  // Seed database function disabled - pools should only be created by users on-chain
  // No automatic BONK or SOL pools will be created
  console.log("[seedDatabase] Skipping - auto-seeding disabled");
}

