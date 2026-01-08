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

// Load .env file manually
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
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
// Initialize Sentry if DSN is provided
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
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

// General API rate limiter (100 requests per minute per IP)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: { message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    // Skip rate limiting for health check
    return req.path === '/health';
  },
});

// Strict rate limiter for expensive operations (10 requests per 5 minutes)
export const strictLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10,
  message: { message: 'Too many requests for this operation, please wait' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiting to all API routes
app.use('/api/', apiLimiter);

// ============================================
// REQUEST BODY SIZE LIMITS & PARSING
// ============================================

// Serve uploaded files
app.use("/uploads", express.static(join(process.cwd(), "public", "uploads")));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Limit request body size to prevent memory exhaustion attacks
app.use(
  express.json({
    limit: '1mb', // Max 1MB JSON payload
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({
  extended: false,
  limit: '1mb', // Max 1MB URL-encoded payload
}));

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
  // Initialize Redis cache (optional - works without it)
  try {
    initRedis();
    logger.info('Redis cache initialized');
  } catch (err: any) {
    logger.warn('Redis not available, continuing without cache');
  }

  // Initialize Solana services (loads DEV wallet from ENV)
  try {
    await initializeSolanaServices();
    log("Solana services initialized successfully");

    // Start pool monitor
    poolMonitor.start();
    log("Pool monitor started");
  } catch (err: any) {
    log(`Failed to initialize Solana services: ${err.message}`, "FATAL");
    log("Pool monitor will not run. Check DEV_WALLET_PRIVATE_KEY in .env", "FATAL");
  }

  // Start transaction cleanup job
  startCleanupJob();
  log("Transaction cleanup job started (runs every 24 hours)");

  // ============================================
  // HEALTH CHECK ENDPOINT
  // ============================================
  app.get('/health', async (_req: Request, res: Response) => {
    try {
      // Check database connection
      await dbPool.query('SELECT 1');

      // Get Pool Monitor status
      const monitorStatus = poolMonitor.getStatus();

      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: 'connected',
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
      logError(err, 'Health check failed');
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: err.message,
      });
    }
  });

  await registerRoutes(httpServer, app);
  await seedDatabase();

  // ============================================
  // SENTRY ERROR HANDLER
  // ============================================
  // Sentry error handler must be before other error handlers
  if (process.env.SENTRY_DSN) {
    app.use(Sentry.setupExpressErrorHandler(app));
  }

  // ============================================
  // GENERAL ERROR HANDLER
  // ============================================
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log error to Winston
    logError(err, `HTTP Error ${status}`);

    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      logger.info(`Server started successfully`, {
        port,
        nodeEnv: process.env.NODE_ENV,
        pid: process.pid,
      });
    },
  );

  // ============================================
  // GRACEFUL SHUTDOWN
  // ============================================
  const gracefulShutdown = async (signal: string) => {
    logger.info(`${signal} received, starting graceful shutdown...`);

    // Stop accepting new connections
    httpServer.close(async () => {
      logger.info('HTTP server closed, no new connections accepted');

      try {
        // Stop transaction cleanup job
        stopCleanupJob();
        logger.info('Transaction cleanup job stopped');

        // Stop Pool Monitor (finish current operations)
        await poolMonitor.stop();
        logger.info('Pool Monitor stopped');

        // Close Redis connection
        const { redis } = await import('./cache');
        if (redis) {
          await redis.quit();
          logger.info('Redis connection closed');
        }

        // Close database connections
        await dbPool.end();
        logger.info('Database connections closed');

        logger.info('Graceful shutdown completed successfully');
        process.exit(0);
      } catch (err: any) {
        logger.error('Error during graceful shutdown', { error: err.message });
        process.exit(1);
      }
    });

    // Force shutdown after 30 seconds if graceful shutdown hangs
    setTimeout(() => {
      logger.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, 30000);
  };

  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', {
      error: err.message,
      stack: err.stack,
    });
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });

  process.on('unhandledRejection', (reason: any) => {
    logger.error('Unhandled Rejection', {
      reason: reason?.message || reason,
      stack: reason?.stack,
    });
    gracefulShutdown('UNHANDLED_REJECTION');
  });
})();
