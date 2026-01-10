/**
 * Enhanced Error Handlers with Sentry Integration
 * Import this after Sentry initialization to add Sentry capturing to global errors
 */

import * as Sentry from "@sentry/node";
import { logger } from "./logger.js";

let originalHandlers: {
  uncaughtException?: (...args: any[]) => void;
  unhandledRejection?: (...args: any[]) => void;
} = {};

export function setupSentryErrorHandlers(gracefulShutdown: (signal: string) => void) {
  if (!process.env.SENTRY_DSN) {
    console.log("[SENTRY] Skipping enhanced error handlers (DSN not configured)");
    return;
  }

  // Store original handlers
  originalHandlers.uncaughtException = process.listeners("uncaughtException")[0] as any;
  originalHandlers.unhandledRejection = process.listeners("unhandledRejection")[0] as any;

  // Remove original handlers
  process.removeAllListeners("uncaughtException");
  process.removeAllListeners("unhandledRejection");

  // Add enhanced handlers with Sentry
  process.on("uncaughtException", (err) => {
    logger.error("Uncaught Exception", {
      error: err.message,
      stack: err.stack,
    });

    // Capture to Sentry before shutdown
    Sentry.captureException(err);

    // Flush Sentry events (wait up to 2 seconds)
    Sentry.close(2000).then(() => {
      gracefulShutdown("UNCAUGHT_EXCEPTION");
    }).catch(() => {
      // Proceed with shutdown even if Sentry flush fails
      gracefulShutdown("UNCAUGHT_EXCEPTION");
    });
  });

  process.on("unhandledRejection", (reason: any) => {
    logger.error("Unhandled Rejection", {
      reason: reason?.message || reason,
      stack: reason?.stack,
    });

    // Capture to Sentry before shutdown
    const error = reason instanceof Error ? reason : new Error(String(reason));
    Sentry.captureException(error);

    // Flush Sentry events (wait up to 2 seconds)
    Sentry.close(2000).then(() => {
      gracefulShutdown("UNHANDLED_REJECTION");
    }).catch(() => {
      gracefulShutdown("UNHANDLED_REJECTION");
    });
  });

  console.log("[SENTRY] ✅ Enhanced error handlers installed");
}
