import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_uym9tYDiI4eC@ep-withered-flower-abim26og-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false }
});

try {
  console.log('\n=== ALL POOLS IN DATABASE ===\n');

  const poolsResult = await pool.query(`
    SELECT
      id,
      pool_address,
      creator_wallet,
      participants_count,
      status,
      entry_amount,
      total_pot,
      token_symbol,
      current_price_usd,
      initial_price_usd
    FROM pools
    ORDER BY id
  `);

  console.log(`Total pools: ${poolsResult.rowCount}\n`);

  let totalValueUsd = 0;

  for (const p of poolsResult.rows) {
    const valueUsd = (p.total_pot || 0) * (p.current_price_usd || p.initial_price_usd || 0);
    totalValueUsd += valueUsd;

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Pool ID: ${p.id}`);
    console.log(`Pool Address: ${p.pool_address}`);
    console.log(`Creator: ${p.creator_wallet}`);
    console.log(`Status: ${p.status}`);
    console.log(`Participants: ${p.participants_count}`);
    console.log(`Token: ${p.token_symbol}`);
    console.log(`Entry Amount: ${p.entry_amount} ${p.token_symbol}`);
    console.log(`Total Pot: ${p.total_pot} ${p.token_symbol}`);
    console.log(`Token Price: $${p.current_price_usd || p.initial_price_usd || 0}`);
    console.log(`💰 POT VALUE: $${valueUsd.toFixed(2)} USD`);

    // Get participants
    const participantsResult = await pool.query(`
      SELECT wallet_address, bet_usd
      FROM participants
      WHERE pool_id = $1
      ORDER BY joined_at
    `, [p.id]);

    console.log(`\nParticipants (${participantsResult.rowCount}):`);
    participantsResult.rows.forEach((part, idx) => {
      console.log(`  ${idx + 1}. ${part.wallet_address.slice(0, 8)}... ($${part.bet_usd || 0})`);
    });
    console.log('');
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n💵 TOTAL VALUE LOCKED: $${totalValueUsd.toFixed(2)} USD\n`);

} catch (error) {
  console.error('Error:', error);
} finally {
  await pool.end();
}
