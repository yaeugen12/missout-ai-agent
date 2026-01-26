import pg from 'pg';
const { Pool } = pg;

const DB_URL = 'postgresql://neondb_owner:npg_uym9tYDiI4eC@ep-withered-flower-abim26og-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const POOL_ADDRESS = '8aayadNne2bZZhTKbcbGS77j1a5YiR5S2Mj5iPSibUEB';

const dbPool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('\n=== DELETING POOL FROM DATABASE ===\n');
  console.log('Pool Address:', POOL_ADDRESS);

  try {
    // Check if pool exists
    const existingPool = await dbPool.query(
      'SELECT id, pool_address, status FROM pools WHERE pool_address = $1',
      [POOL_ADDRESS]
    );

    if (existingPool.rows.length === 0) {
      console.log('❌ Pool not found in database');
      return;
    }

    const poolId = existingPool.rows[0].id;
    console.log(`Found Pool ID: ${poolId}, Status: ${existingPool.rows[0].status}`);

    // Delete participants first (foreign key constraint)
    const participantsResult = await dbPool.query(
      'DELETE FROM participants WHERE pool_id = $1',
      [poolId]
    );
    console.log(`✅ Deleted ${participantsResult.rowCount} participant(s)`);

    // Delete pool
    const poolResult = await dbPool.query(
      'DELETE FROM pools WHERE id = $1',
      [poolId]
    );
    console.log(`✅ Deleted pool (${poolResult.rowCount} row(s))`);

    console.log('\n✅ Pool successfully removed from database\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
  }

  await dbPool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
