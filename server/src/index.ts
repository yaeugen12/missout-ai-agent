import express, { type Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import cors from "cors";
import helmet from "helmet";
import { registerRoutes, seedDatabase } from "./routes.js";
import { createServer } from "http";
import { initializeSolanaServices } from "./pool-monitor/solanaServices.js";
import { poolMonitor } from "./pool-monitor/poolMonitor.js";
import { pool as dbPool } from "./db.js";
import { initRedis } from "./cache.js";
import { logger, logError } from "./logger.js";
import { startCleanupJob, stopCleanupJob } from "./transactionCleanup.js";
import { readFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import * as Sentry from "@sentry/node";

import { setupSentryErrorHandlers } from "./error-handlers-sentry.js";
// ============================================================
// FIX: Cross-platform support for ESM + CJS (Render compatible)
// ============================================================

let __filename: string;
let __dirname: string;

try {
  // Works locally (tsx / ESM)
  __filename = fileURLToPath(import.meta.url);
  __dirname = dirname(__filename);
} catch {
  // Works on Render (node dist/index.cjs)
  // @ts-ignore
  __filename = typeof __filename !== "undefined" ? __filename : "";
  // @ts-ignore
  __dirname = typeof __dirname !== "undefined" ? __dirname : process.cwd();
}

// Load .env file only in development (production uses Render environment variables)
if (process.env.NODE_ENV !== "production") {
  const envPath = resolve(__dirname, "../.env");

  try {
    const envFile = readFileSync(envPath, "utf8");
    envFile.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...values] = trimmed.split("=");
        if (key && values.length) {
          process.env[key.trim()] = values.join("=").trim();
        }
      }
    });
    console.log("[ENV] ✅ Loaded .env file from:", envPath);
  } catch (err: any) {
    console.log("[ENV] ⚠️  No .env file found at:", envPath, "- using system environment variables");
  }
} else {
  console.log("[ENV] ✅ Production mode - using system environment variables");
}

// ============================================
// SENTRY ERROR MONITORING (Optional)
// ============================================
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
  console.log("[SENTRY] ✅ Error monitoring initialized");
} else {
  console.log("[SENTRY] ⚠️  SENTRY_DSN not found - error monitoring disabled");
}

const app = express();
const httpServer = createServer(app);
// ============================================
// TRUST PROXY (Required for Render deployment)
// ============================================
// Enable trust proxy to properly handle X-Forwarded-For headers from Render
app.set('trust proxy', 1);
console.log("[SECURITY] ✅ Trust proxy enabled for production deployment");


// ============================================
// SECURITY MIDDLEWARE (CORS + Helmet)
// ============================================

// CORS Configuration - Allow frontend to access API
app.use(cors({
  origin: [
    "https://www.missout.fun",
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL,
    "http://localhost:5173"
  ].filter(Boolean),
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["X-Request-ID"],
}));

console.log("[SECURITY] ✅ CORS enabled for origin:", process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173');

// Helmet Security Headers - Protection against common web vulnerabilities
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API-only server
  crossOriginEmbedderPolicy: false, // Allow embedding resources
  crossOriginResourcePolicy: false, // Allow loading images from frontend
}));

console.log("[SECURITY] ✅ Helmet security headers enabled");

// ============================================
// RATE LIMITING
// ============================================

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: { message: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.path === "/health",
});

export const strictLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { message: "Too many requests for this operation, please wait" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", apiLimiter);

// ============================================
// REQUEST BODY SIZE LIMITS & PARSING
// ============================================

app.use("/uploads", express.static(join(process.cwd(), "public", "uploads")));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "1mb",
  })
);

// ============================================
// JSON ERROR HANDLER (malformed JSON protection)
// ============================================
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    console.error('[Security] Invalid JSON received:', {
      path: req.path,
      method: req.method,
      error: err.message,
    });
    return res.status(400).json({
      message: 'Invalid JSON format in request body',
      error: 'Bad Request'
    });
  }
  next(err);
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    initRedis();
    logger.info("Redis cache initialized");
  } catch {
    logger.warn("Redis not available, continuing without cache");
  }

  try {
    await initializeSolanaServices();
    log("Solana services initialized successfully");

    poolMonitor.start();
    log("Pool monitor started");
  } catch (err: any) {
    log(`Failed to initialize Solana services: ${err.message}`, "FATAL");
    log("Pool monitor will not run. Check DEV_WALLET_PRIVATE_KEY in .env", "FATAL");
  }

  startCleanupJob();
  log("Transaction cleanup job started (runs every 24 hours)");

  app.get("/health", async (_req, res) => {
    try {
      await dbPool.query("SELECT 1");

      const monitorStatus = poolMonitor.getStatus();
      const { getRedisStats } = await import("./redis.js");
      const redisStats = await getRedisStats();
      const { rpcManager } = await import("./rpc-manager.js");
      const rpcStats = rpcManager.getStats();

      // RPC connectivity test - actually check if we can reach Solana
      let solanaConnected = false;
      let solanaSlot = null;
      let solanaLatency = null;
      try {
        const startRpc = Date.now();
        const connection = rpcManager.getConnection();
        solanaSlot = await connection.getSlot();
        solanaLatency = Date.now() - startRpc;
        solanaConnected = solanaSlot > 0;
      } catch (err: any) {
        logger.warn('RPC health check failed:', err.message);
        solanaConnected = false;
      }

      res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: "connected",
        redis: redisStats.enabled
          ? {
              connected: redisStats.connected,
              dbSize: redisStats.dbSize,
              status: redisStats.status,
            }
          : "disabled",
        rpc: {
          connected: solanaConnected,
          currentSlot: solanaSlot,
          latency: solanaLatency,
          totalEndpoints: rpcStats.totalEndpoints,
          healthyEndpoints: rpcStats.healthyEndpoints,
          endpoints: rpcStats.endpoints,
        },
        poolMonitor: {
          running: monitorStatus.running,
          processingCount: monitorStatus.processingCount,
        },
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        },
      });
    } catch (err: any) {
      logError(err, "Health check failed");
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: err.message,
      });
    }
  });

  await registerRoutes(httpServer, app);
  await seedDatabase();

  // Sentry error handler (must be after all routes)
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

  // Custom error handler (must be last)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logError(err, `HTTP Error ${status}`);

    res.status(status).json({ message });
  });

  const port = parseInt(process.env.PORT || "5000", 10);

  // Track active connections for graceful shutdown
  const connections = new Set<any>();

  httpServer.on('connection', (connection) => {
    connections.add(connection);
    connection.on('close', () => {
      connections.delete(connection);
    });
  });

  httpServer.listen(
    { port, host: "0.0.0.0", reusePort: true },
    () => {
      log(`serving on port ${port}`);
      logger.info(`Server started successfully`, {
        port,
        nodeEnv: process.env.NODE_ENV,
        pid: process.pid,
      });
    }
  );

  let isShuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    // Prevent multiple shutdown calls
    if (isShuttingDown) {
      logger.warn(`Shutdown already in progress, ignoring ${signal}`);
      return;
    }
    isShuttingDown = true;

    logger.info(`${signal} received, starting graceful shutdown...`, {
      pid: process.pid,
      uptime: process.uptime(),
    });

    // Set a hard timeout for forced shutdown (30s should be enough with connection forcing)
    const forceShutdownTimeout = setTimeout(() => {
      logger.error("Graceful shutdown timeout (30s), forcing exit", {
        signal,
        pid: process.pid,
      });
      process.exit(1);
    }, 30000); // 30 seconds (connections are force-closed after 5s)

    try {
      // Step 1: Stop accepting new connections and destroy active ones
      logger.info("Closing HTTP server...", {
        activeConnections: connections.size,
      });

      // Close server (stops accepting new connections)
      const serverClosePromise = new Promise<void>((resolve, reject) => {
        httpServer.close((err) => {
          if (err) {
            logger.error("Error closing HTTP server", { error: err.message });
            reject(err);
          } else {
            logger.info("✅ HTTP server closed, no new connections accepted");
            resolve();
          }
        });
      });

      // Force close active connections after 5 seconds
      const forceCloseTimeout = setTimeout(() => {
        logger.warn(`Forcefully closing ${connections.size} active connections`);
        connections.forEach((connection) => {
          connection.destroy();
        });
        connections.clear();
      }, 5000);

      // Wait for server to close or timeout
      await Promise.race([
        serverClosePromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Server close timeout")), 10000)
        ),
      ]);

      clearTimeout(forceCloseTimeout);

      // Step 2: Stop background jobs
      logger.info("Stopping background jobs...");

      stopCleanupJob();
      logger.info("✅ Transaction cleanup job stopped");

      await poolMonitor.stop();
      logger.info("✅ Pool Monitor stopped");

      // Stop token discovery service
      try {
        const { tokenDiscoveryService } = await import("./tokenDiscoveryService.js");
        if (tokenDiscoveryService && typeof tokenDiscoveryService.stop === 'function') {
          tokenDiscoveryService.stop();
          logger.info("✅ Token discovery service stopped");
        }
      } catch (err) {
        logger.warn("Token discovery service not stoppable or not found");
      }

      // Step 3: Close Redis connection with timeout
      logger.info("Closing Redis connection...");
      try {
        const { redis } = await import("./cache.js");
        if (redis) {
          // Use disconnect() instead of quit() for faster shutdown
          await Promise.race([
            redis.disconnect(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Redis disconnect timeout")), 5000)
            ),
          ]);
          logger.info("✅ Redis connection closed");
        }
      } catch (err: any) {
        logger.warn("Redis disconnect failed or timed out", { error: err.message });
      }

      // Step 4: Close database connections
      logger.info("Closing database connections...");
      await Promise.race([
        dbPool.end(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Database pool end timeout")), 10000)
        ),
      ]);
      logger.info("✅ Database connections closed");

      // Step 5: Flush Sentry events if enabled
      if (process.env.SENTRY_DSN) {
        logger.info("Flushing Sentry events...");
        await Sentry.close(2000);
        logger.info("✅ Sentry events flushed");
      }

      // Clear the force shutdown timeout
      clearTimeout(forceShutdownTimeout);

      logger.info("🎉 Graceful shutdown completed successfully", {
        signal,
        pid: process.pid,
        uptime: process.uptime(),
      });

      process.exit(0);
    } catch (err: any) {
      logger.error("❌ Error during graceful shutdown", {
        error: err.message,
        stack: err.stack,
        signal,
      });

      clearTimeout(forceShutdownTimeout);
      process.exit(1);
    }
  };

  // Setup enhanced error handlers with Sentry capturing (only if Sentry is enabled)
  if (process.env.SENTRY_DSN) {
    setupSentryErrorHandlers(gracefulShutdown);
    console.log("[SENTRY] ✅ Error handlers connected to Sentry");
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught Exception", {
      error: err.message,
      stack: err.stack,
    });
    gracefulShutdown("UNCAUGHT_EXCEPTION");
  });

  process.on("unhandledRejection", (reason: any) => {
    logger.error("Unhandled Rejection", {
      reason: reason?.message || reason,
      stack: reason?.stack,
    });
    gracefulShutdown("UNHANDLED_REJECTION");
  });
})();
