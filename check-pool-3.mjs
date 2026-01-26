import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_uym9tYDiI4eC@ep-withered-flower-abim26og-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false }
});

try {
  console.log('\n=== CHECKING POOL 3 ===\n');

  // Get pool 3
  const poolResult = await pool.query(`
    SELECT id, creator_wallet, participants_count, status, pool_address, tx_hash
    FROM pools
    WHERE id = 3
  `);

  if (poolResult.rows.length === 0) {
    console.log('Pool 3 not found in database');
  } else {
    const p = poolResult.rows[0];
    console.log(`Pool ID: ${p.id}`);
    console.log(`Creator: ${p.creator_wallet}`);
    console.log(`Pool Address: ${p.pool_address}`);
    console.log(`Status: ${p.status}`);
    console.log(`Participants Count (pool): ${p.participants_count}`);
    console.log(`Tx Hash: ${p.tx_hash}`);

    // Get participants for pool 3
    const participantsResult = await pool.query(`
      SELECT wallet_address, joined_at, bet_usd, price_at_join_usd
      FROM participants
      WHERE pool_id = 3
      ORDER BY joined_at
    `);

    console.log(`\n=== PARTICIPANTS (${participantsResult.rows.length}) ===\n`);
    participantsResult.rows.forEach((part, idx) => {
      console.log(`${idx + 1}. Wallet: ${part.wallet_address}`);
      console.log(`   Joined: ${part.joined_at}`);
      console.log(`   Bet USD: ${part.bet_usd}`);
      console.log(`   Price at Join: $${part.price_at_join_usd}`);
      console.log('');
    });

    // Check if creator is participant
    const creatorIsParticipant = participantsResult.rows.some(
      part => part.wallet_address.toLowerCase() === p.creator_wallet.toLowerCase()
    );
    console.log(`Creator is participant: ${creatorIsParticipant ? '✅ YES' : '❌ NO'}`);

    if (creatorIsParticipant) {
      console.log('\n✅ CREATOR AUTO-JOIN WORKS CORRECTLY!\n');
    } else {
      console.log('\n❌ CREATOR NOT IN PARTICIPANTS - BUG!\n');
    }
  }

} catch (error) {
  console.error('Error:', error);
} finally {
  await pool.end();
}
