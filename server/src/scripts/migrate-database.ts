#!/usr/bin/env tsx
/**
 * Database Migration Script
 * Runs Drizzle migrations on deployment (or skips if using push mode)
 */

import { existsSync } from 'fs';
import { join } from 'path';

async function runMigrations() {
  console.log('🔄 Checking for database migrations...');
  
  const migrationsPath = join(process.cwd(), 'drizzle');
  
  // Check if migrations folder exists and has files
  if (!existsSync(migrationsPath)) {
    console.log('⚠️  No drizzle/ folder found - skipping migrations');
    console.log('ℹ️  Database schema is likely managed via drizzle-kit push');
    process.exit(0);
  }

  const { readdirSync } = await import('fs');
  const files = readdirSync(migrationsPath);
  
  if (files.length === 0) {
    console.log('⚠️  No migration files found - skipping');
    console.log('ℹ️  Database schema is managed via drizzle-kit push');
    process.exit(0);
  }

  console.log(`📁 Found ${files.length} migration file(s), running migrations...`);

  try {
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const { default: pg } = await import('pg');
    
    const databaseUrl = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL;
    
    if (!databaseUrl) {
      console.error('❌ DATABASE_URL not found in environment');
      process.exit(1);
    }

    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const db = drizzle(pool);

    await migrate(db, { migrationsFolder: './drizzle' });
    await pool.end();
    
    console.log('✅ Database migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
