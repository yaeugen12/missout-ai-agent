import pg from 'pg';
const { Pool } = pg;

const DB_URL = 'postgresql://neondb_owner:npg_uym9tYDiI4eC@ep-withered-flower-abim26og-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const dbPool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('\n=== POOLS TABLE SCHEMA ===\n');

  const result = await dbPool.query(`
    SELECT
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_name = 'pools'
    ORDER BY ordinal_position
  `);

  console.log('NOT NULL columns (required):');
  result.rows
    .filter(r => r.is_nullable === 'NO' && !r.column_default)
    .forEach(r => {
      console.log(`  - ${r.column_name} (${r.data_type})`);
    });

  console.log('\nNULLABLE columns (optional):');
  result.rows
    .filter(r => r.is_nullable === 'YES' || r.column_default)
    .forEach(r => {
      console.log(`  - ${r.column_name} (${r.data_type}) ${r.column_default ? `DEFAULT ${r.column_default}` : ''}`);
    });

  await dbPool.end();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
