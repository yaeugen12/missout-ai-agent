import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_uym9tYDiI4eC@ep-withered-flower-abim26og-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false }
});

try {
  console.log('\n=== CHECKING DATABASE ===\n');

  // Count total pools
  const poolCountResult = await pool.query(`SELECT COUNT(*) as count FROM pools`);
  console.log(`Total Pools in DB: ${poolCountResult.rows[0].count}`);

  // Count total participants
  const participantCountResult = await pool.query(`SELECT COUNT(*) as count FROM participants`);
  console.log(`Total Participants in DB: ${participantCountResult.rows[0].count}`);

  // If we have pools, show them all
  if (poolCountResult.rows[0].count > 0) {
    const allPoolsResult = await pool.query(`
      SELECT id, creator_wallet, participants_count, status, pool_address
      FROM pools
      ORDER BY id
    `);

    console.log('\n=== ALL POOLS ===\n');
    for (const p of allPoolsResult.rows) {
      console.log(`Pool ID: ${p.id}`);
      console.log(`Creator: ${p.creator_wallet}`);
      console.log(`Pool Address: ${p.pool_address}`);
      console.log(`Status: ${p.status}`);
      console.log(`Participants Count: ${p.participants_count}`);

      // Get participants for this pool
      const participantsResult = await pool.query(`
        SELECT wallet_address, joined_at
        FROM participants
        WHERE pool_id = $1
        ORDER BY joined_at
      `, [p.id]);

      console.log(`Actual Participants: ${participantsResult.rows.length}`);
      participantsResult.rows.forEach((part, idx) => {
        console.log(`  ${idx + 1}. ${part.wallet_address}`);
      });

      // Check if creator is participant
      const creatorIsParticipant = participantsResult.rows.some(
        part => part.wallet_address.toLowerCase() === p.creator_wallet.toLowerCase()
      );
      console.log(`Creator is participant: ${creatorIsParticipant ? '✅ YES' : '❌ NO'}\n---\n`);
    }
  }

} catch (error) {
  console.error('Error:', error);
} finally {
  await pool.end();
}
