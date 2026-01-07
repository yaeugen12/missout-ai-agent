import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Connection pool configuration for production scale
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum 20 connections in pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Timeout if connection takes > 2s
  maxUses: 7500, // Rotate connections after 7500 uses (prevent memory leaks)
});

// Error handling for unexpected database errors
pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client', err);
  // Don't exit process - pool will recover
});

pool.on('connect', () => {
  console.log('[PostgreSQL] New client connected to pool');
});

pool.on('remove', () => {
  console.log('[PostgreSQL] Client removed from pool');
});

export const db = drizzle(pool, { schema });
