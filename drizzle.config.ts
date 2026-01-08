import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit Configuration for Production PostgreSQL + pgBouncer
 *
 * IMPORTANT: Migrations MUST use DIRECT_DATABASE_URL (non-pooled connection)
 * because pgBouncer in transaction mode doesn't support:
 * - Prepared statements
 * - Advisory locks
 * - Session-level features
 *
 * Application code uses DATABASE_URL (pooled via pgBouncer)
 */

// For migrations: Use DIRECT_DATABASE_URL (bypasses pgBouncer)
// For application: Use DATABASE_URL (goes through pgBouncer)
const migrationUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error(
    "DATABASE_URL or DIRECT_DATABASE_URL must be set.\n\n" +
    "For production with pgBouncer:\n" +
    "  DATABASE_URL=postgresql://user:pass@host:6543/db?pgbouncer=true  (pooled)\n" +
    "  DIRECT_DATABASE_URL=postgresql://user:pass@host:5432/db          (direct)\n\n" +
    "For development (local Postgres):\n" +
    "  DATABASE_URL=postgresql://user:pass@localhost:5432/db\n"
  );
}

export default defineConfig({
  out: "./drizzle/migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationUrl,
  },
  verbose: true,
  strict: true,
});
