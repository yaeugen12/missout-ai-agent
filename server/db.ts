import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?\n\n" +
    "Get your connection string from:\n" +
    "  - Supabase: Settings > Database > Connection string (pooled)\n" +
    "  - Railway: Variables > DATABASE_URL\n" +
    "  - Render: Dashboard > Database > Connection string\n"
  );
}

/**
 * PostgreSQL Connection Pool Configuration
 *
 * Optimized for production with pgBouncer compatibility:
 * - pgBouncer runs in TRANSACTION mode (recommended for Node.js apps)
 * - Connection pooling prevents database connection exhaustion
 * - Automatic connection rotation prevents memory leaks
 * - Graceful error handling for production stability
 *
 * pgBouncer Setup:
 * - Supabase: Automatically enabled on port 6543 (use ?pgbouncer=true)
 * - Railway/Render: Add pgBouncer addon or use Supabase's pooler
 * - Self-hosted: Configure pgBouncer in transaction mode
 */

const isPgBouncer = process.env.DATABASE_URL.includes('pgbouncer=true') || 
                    process.env.DATABASE_URL.includes(':6543');

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  
  // Pool size configuration
  max: isPgBouncer ? 10 : 20, // Fewer connections needed with pgBouncer
  min: 2, // Keep minimum 2 connections alive
  
  // Timeout configuration
  idleTimeoutMillis: 30000, // Close idle clients after 30s
  connectionTimeoutMillis: 10000, // Allow 10s for connection (network latency)
  
  // pgBouncer compatibility
  application_name: 'missout-backend',
  
  // Connection lifecycle
  maxUses: isPgBouncer ? 50000 : 7500, // pgBouncer handles rotation, so higher limit
  
  // SSL configuration (required for Supabase in both dev and production)
  ssl: process.env.DATABASE_URL?.includes('supabase.co')
    ? { rejectUnauthorized: false } // Supabase uses self-signed certs
    : process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined,
});

// Pool event handlers for monitoring and error tracking
pool.on('error', (err: any) => {
  console.error('[PostgreSQL] ❌ Unexpected error on idle client:', {
    error: err.message,
    code: err.code,
    detail: err.detail,
  });

  // Send critical database errors to Sentry
  if (process.env.SENTRY_DSN) {
    import('./sentry-helper').then(({ captureError }) => {
      captureError(err, {
        context: 'database_pool_error',
        extra: {
          code: err.code,
          detail: err.detail,
        },
      });
    });
  }
  // Don't exit process - pool will recover automatically
});

pool.on('connect', () => {
  console.log('[PostgreSQL] ✅ New client connected to pool');
});

pool.on('remove', () => {
  console.log('[PostgreSQL] 🔄 Client removed from pool');
});

// Track pool exhaustion (only log when pool is full)
let lastPoolWarning = 0;
pool.on('acquire', () => {
  const now = Date.now();
  // Warn if pool is near capacity (>80% used)
  const usedConnections = pool.totalCount - pool.idleCount;
  const maxConnections = pool.options.max || 20;
  const usagePercent = (usedConnections / maxConnections) * 100;

  if (usagePercent > 80 && now - lastPoolWarning > 60000) { // Warn max once per minute
    console.warn('[PostgreSQL] ⚠️  Pool near capacity:', {
      used: usedConnections,
      max: maxConnections,
      usage: `${usagePercent.toFixed(1)}%`,
      waiting: pool.waitingCount,
    });
    lastPoolWarning = now;

    // Alert via Sentry if pool is exhausted
    if (process.env.SENTRY_DSN && usagePercent >= 90) {
      import('./sentry-helper').then(({ captureMessage }) => {
        captureMessage('Database pool near exhaustion', 'warning', {
          extra: {
            used: usedConnections,
            max: maxConnections,
            usage: usagePercent,
            waiting: pool.waitingCount,
          },
        });
      });
    }
  }
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('[PostgreSQL] ❌ Failed to connect to database:', err.message);
    console.error('Check your DATABASE_URL and ensure the database is running.');
  } else {
    console.log('[PostgreSQL] ✅ Database connection verified at', res.rows[0].now);
    console.log('[PostgreSQL] Connection pool initialized:', {
      max: pool.options.max,
      min: pool.options.min,
      idleTimeout: pool.options.idleTimeoutMillis + 'ms',
      pgBouncer: isPgBouncer,
    });
  }
});

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('[PostgreSQL] Graceful shutdown initiated...');
  try {
    await pool.end();
    console.log('[PostgreSQL] Connection pool closed successfully');
    process.exit(0);
  } catch (err) {
    console.error('[PostgreSQL] Error during pool shutdown:', err);
    process.exit(1);
  }
});

export const db = drizzle(pool, { schema });

/**
 * Health check function for monitoring
 */
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
  poolStats?: {
    total: number;
    idle: number;
    waiting: number;
  };
}> {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    const latency = Date.now() - start;
    
    return {
      healthy: true,
      latency,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    };
  } catch (error: any) {
    return {
      healthy: false,
      error: error.message,
    };
  }
}
