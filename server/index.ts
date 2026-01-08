import express, { type Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { registerRoutes, seedDatabase } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initializeSolanaServices } from "./pool-monitor/solanaServices";
import { poolMonitor } from "./pool-monitor/poolMonitor";
import { pool as dbPool } from "./db";
import { initRedis } from "./cache";
import { logger, logError } from "./logger";
import { startCleanupJob, stopCleanupJob } from "./transactionCleanup";
import { readFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import * as Sentry from "@sentry/node";

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
  console.log("[ENV] ⚠️  No .env file found at:", envPath);
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
// SECURITY & RATE LIMITING
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

      res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: "connected",
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

  if (process.env.SENTRY_DSN) {
    app.use(Sentry.setupExpressErrorHandler(app));
  }

  app.use((err: any, _req, res) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logError(err, `HTTP Error ${status}`);

    res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
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

  const gracefulShutdown = async (signal: string) => {
    logger.info(`${signal} received, starting graceful shutdown...`);

    httpServer.close(async () => {
      logger.info("HTTP server closed, no new connections accepted");

      try {
        stopCleanupJob();
        logger.info("Transaction cleanup job stopped");

        await poolMonitor.stop();
        logger.info("Pool Monitor stopped");

        const { redis } = await import("./cache");
        if (redis) {
          await redis.quit();
          logger.info("Redis connection closed");
        }

        await dbPool.end();
        logger.info("Database connections closed");

        logger.info("Graceful shutdown completed successfully");
        process.exit(0);
      } catch (err: any) {
        logger.error("Error during graceful shutdown", {
          error: err.message,
        });
        process.exit(1);
      }
    });

    setTimeout(() => {
      logger.error("Graceful shutdown timeout, forcing exit");
      process.exit(1);
    }, 30000);
  };

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
