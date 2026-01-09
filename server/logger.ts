import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

// ============================================================
// FIX: Support for both ESM (local dev) and CJS (Render build)
// ============================================================

let __filename: string;
let __dirname: string;

try {
  // Works in ESM (tsx local)
  __filename = fileURLToPath(import.meta.url);
  __dirname = dirname(__filename);
} catch {
  // Works in CJS (Render build)
  // @ts-ignore
  __filename = typeof __filename !== "undefined" ? __filename : "";
  // @ts-ignore
  __dirname = typeof __dirname !== "undefined" ? __dirname : process.cwd();
}

// ------------------------------------------------------------
// Ensure logs directory exists
// ------------------------------------------------------------

const logsDir = path.resolve(__dirname, '../logs');
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'missout-api' },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
    }),

    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

// Console logging
if (isDevelopment) {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
} else {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
      level: 'warn',
    })
  );
}

// Helper functions
export const logRequest = (
  method: string,
  path: string,
  statusCode: number,
  duration: number
) => {
  logger.info('HTTP Request', {
    method,
    path,
    statusCode,
    duration: `${duration}ms`,
  });
};

export const logPoolMonitor = (message: string, meta?: any) => {
  logger.info(`[PoolMonitor] ${message}`, meta);
};


export default logger;

export const logError = (error: Error, context?: string, sentryContext?: Record<string, any>) => {
  logger.error(context || 'Error', {
    message: error.message,
    stack: error.stack,
  });

  // Also send to Sentry if configured
  if (process.env.SENTRY_DSN) {
    try {
      const { captureError } = require('./sentry-helper');
      captureError(error, { context, ...sentryContext });
    } catch (err) {
      console.error('[SENTRY] Failed to capture error:', err);
    }
  }
};
