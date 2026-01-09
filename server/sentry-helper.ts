/**
 * Sentry Helper Functions for Error Tracking
 * 
 * Provides convenient wrappers for capturing errors with context
 */

import * as Sentry from "@sentry/node";

/**
 * Capture an error with Sentry if DSN is configured
 * @param error - The error to capture
 * @param context - Additional context (wallet, poolId, txHash, etc.)
 */
export function captureError(error: Error | unknown, context?: Record<string, any>): void {
  if (!process.env.SENTRY_DSN) return;

  try {
    Sentry.withScope((scope) => {
      // Add custom context
      if (context) {
        Object.entries(context).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            scope.setContext(key, typeof value === 'object' ? value : { value: String(value) });
          }
        });
      }

      // Capture the error
      if (error instanceof Error) {
        Sentry.captureException(error);
      } else {
        Sentry.captureMessage(String(error), "error");
      }
    });
  } catch (err) {
    // Don't let Sentry errors break the application
    console.error('[SENTRY] Error capturing exception:', err);
  }
}

/**
 * Capture a message with Sentry
 * @param message - The message to capture
 * @param level - Severity level
 * @param context - Additional context
 */
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  context?: Record<string, any>
): void {
  if (!process.env.SENTRY_DSN) return;

  try {
    Sentry.withScope((scope) => {
      if (context) {
        Object.entries(context).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            scope.setContext(key, typeof value === 'object' ? value : { value: String(value) });
          }
        });
      }

      Sentry.captureMessage(message, level);
    });
  } catch (err) {
    console.error('[SENTRY] Error capturing message:', err);
  }
}

/**
 * Add breadcrumb for debugging context
 * @param message - Breadcrumb message
 * @param data - Additional data
 * @param category - Category (e.g., "pool", "transaction", "auth")
 */
export function addBreadcrumb(
  message: string,
  data?: Record<string, any>,
  category?: string
): void {
  if (!process.env.SENTRY_DSN) return;

  try {
    Sentry.addBreadcrumb({
      message,
      data,
      category,
      level: "info",
      timestamp: Date.now() / 1000,
    });
  } catch (err) {
    console.error('[SENTRY] Error adding breadcrumb:', err);
  }
}

/**
 * Set user context for error tracking
 * @param walletAddress - User's wallet address
 */
export function setUserContext(walletAddress: string | null): void {
  if (!process.env.SENTRY_DSN) return;

  try {
    if (walletAddress) {
      Sentry.setUser({ id: walletAddress });
    } else {
      Sentry.setUser(null);
    }
  } catch (err) {
    console.error('[SENTRY] Error setting user context:', err);
  }
}
