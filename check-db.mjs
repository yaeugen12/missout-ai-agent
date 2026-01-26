import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_uym9tYDiI4eC@ep-withered-flower-abim26og-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false }
});

try {
  console.log('\n=== CHECKING POOLS AND PARTICIPANTS ===\n');

  // Get latest 5 pools
  const poolsResult = await pool.query(`
    SELECT id, creator_wallet, participants_count, status, start_time
    FROM pools
    ORDER BY id DESC
    LIMIT 5
  `);

  for (const p of poolsResult.rows) {
    console.log(`Pool ID: ${p.id}`);
    console.log(`Creator: ${p.creator_wallet}`);
    console.log(`Status: ${p.status}`);
    console.log(`Participants Count (pool): ${p.participants_count}`);
    console.log(`Start Time: ${p.start_time}`);

    // Get actual participants from participants table
    const participantsResult = await pool.query(`
      SELECT wallet_address, joined_at
      FROM participants
      WHERE pool_id = $1
      ORDER BY joined_at
    `, [p.id]);

    console.log(`\nActual Participants in DB: ${participantsResult.rows.length}`);
    participantsResult.rows.forEach((part, idx) => {
      console.log(`  ${idx + 1}. ${part.wallet_address} (joined: ${part.joined_at})`);
    });

    // Check if creator is participant
    const creatorIsParticipant = participantsResult.rows.some(
      part => part.wallet_address.toLowerCase() === p.creator_wallet.toLowerCase()
    );
    console.log(`Creator is participant: ${creatorIsParticipant ? '✅ YES' : '❌ NO'}`);
    console.log('---\n');
  }

} catch (error) {
  console.error('Error:', error);
} finally {
  await pool.end();
}
