import pg from 'pg';
const { Pool } = pg;

const DB_URL = 'postgresql://neondb_owner:npg_uym9tYDiI4eC@ep-withered-flower-abim26og-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const POOL_ADDRESSES = [
  '6g8vphUmW1HkGzMUrm9zt7up9PgTiTQg7Ab7gG5K2b2u',
  '8aayadNne2bZZhTKbcbGS77j1a5YiR5S2Mj5iPSibUEB',
  'HZXQshBDPWUFNuF5BimrxtCSgg2aAu2mx4eTfSV48swh',
  'HppvCrkSWB1qp6QnJkJ4EGbtc1qpsp11ZUMNnVyYJyin', // Pool 3 - already in DB
];

const dbPool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('\n=== ADDING POOLS TO DATABASE (SIMPLE) ===\n');
  console.log('Pool monitor will sync full data automatically when it runs.\n');

  for (const poolAddress of POOL_ADDRESSES) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Processing: ${poolAddress}`);

    try {
      // Check if already in DB
      const existingPool = await dbPool.query(
        'SELECT id, pool_address, status FROM pools WHERE pool_address = $1',
        [poolAddress]
      );

      if (existingPool.rows.length > 0) {
        console.log(`✅ Already in DB: Pool ID ${existingPool.rows[0].id}, Status: ${existingPool.rows[0].status}`);
        continue;
      }

      // Insert with minimal data - pool monitor will sync the rest
      const insertResult = await dbPool.query(`
        INSERT INTO pools (
          pool_address,
          creator_wallet,
          participants_count,
          status,
          entry_amount,
          total_pot,
          token_symbol,
          token_name,
          min_participants,
          max_participants,
          lock_duration,
          start_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `, [
        poolAddress,
        'hexjpxforqumcedjha6w5d4vpr11mpmdgmtcz5zhezbz', // Creator (lowercase)
        1, // Will be synced by monitor
        'locked', // Default status - monitor will update
        1000000, // Placeholder - will be synced
        0, // Total pot starts at 0
        'UNKNOWN', // Will be synced
        'Unknown Token', // Will be synced
        2, // Min participants - will be synced
        10, // Max participants - will be synced
        300, // Lock duration 5 minutes - will be synced
        new Date(), // Now - will be synced
      ]);

      const poolId = insertResult.rows[0].id;
      console.log(`✅ Added to DB: Pool ID ${poolId}`);
      console.log(`   Pool monitor will sync full on-chain data automatically`);

    } catch (err) {
      console.error(`❌ Error processing ${poolAddress}:`, err.message);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n✅ Done! Pool monitor will detect and process these pools automatically.');
  console.log('Monitor runs every few seconds and will:');
  console.log('  1. Sync on-chain data (status, amounts, participants)');
  console.log('  2. Unlock pools');
  console.log('  3. Request randomness');
  console.log('  4. Reveal randomness');
  console.log('  5. Select winner');
  console.log('  6. Payout winner\n');

  await dbPool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
