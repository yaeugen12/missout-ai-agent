import pg from 'pg';
const { Pool } = pg;
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { readFileSync } from 'fs';
const IDL = JSON.parse(readFileSync('./shared/idl.json', 'utf8'));

const DB_URL = 'postgresql://neondb_owner:npg_uym9tYDiI4eC@ep-withered-flower-abim26og-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=3c5e3da7-9230-4336-9060-3b2aae17eb07';
const PROGRAM_ID = new PublicKey('4wgBJUHydWXXJKXYsmdGoGw1ufC3dxz8q2mukFYaAhSm');

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
  console.log('\n=== ADDING POOLS TO DATABASE ===\n');

  const conn = new Connection(RPC_URL, 'confirmed');
  const wallet = { publicKey: PublicKey.default };
  const provider = new AnchorProvider(conn, wallet, {});
  const program = new Program(IDL, PROGRAM_ID, provider);

  for (const poolAddress of POOL_ADDRESSES) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
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

      // Fetch on-chain data
      const poolPk = new PublicKey(poolAddress);
      const poolData = await program.account.pool.fetch(poolPk, 'confirmed');

      const statusMap = {
        open: 'open',
        locked: 'locked',
        unlocked: 'unlocked',
        randomnessCommitted: 'randomness',
        randomnessRevealed: 'randomness_revealed',
        winnerSelected: 'winnerSelected',
        ended: 'ended',
      };

      const statusKey = Object.keys(poolData.status)[0];
      const dbStatus = statusMap[statusKey] || 'open';

      console.log(`Fetched on-chain data:`);
      console.log(`  Creator: ${poolData.creator.toBase58()}`);
      console.log(`  Status: ${statusKey} -> ${dbStatus}`);
      console.log(`  Amount: ${poolData.amount.toString()}`);
      console.log(`  Total: ${poolData.totalAmount.toString()}`);
      console.log(`  Joins: ${poolData.totalJoins}`);
      console.log(`  Mint: ${poolData.mint.toBase58()}`);

      // Insert into DB
      const insertResult = await dbPool.query(`
        INSERT INTO pools (
          pool_address,
          creator_wallet,
          participants_count,
          status,
          entry_amount,
          total_pot,
          token_symbol,
          token_mint,
          start_time,
          duration,
          lock_duration,
          max_participants
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `, [
        poolAddress,
        poolData.creator.toBase58().toLowerCase(),
        poolData.totalJoins,
        dbStatus,
        poolData.amount.toString(),
        poolData.totalAmount.toString(),
        'UNKNOWN', // We don't know symbol yet
        poolData.mint.toBase58(),
        new Date(poolData.startTime.toNumber() * 1000),
        poolData.duration.toNumber(),
        poolData.lockDuration.toNumber(),
        poolData.maxParticipants
      ]);

      const poolId = insertResult.rows[0].id;
      console.log(`✅ Added to DB: Pool ID ${poolId}`);

      // Add creator as first participant
      await dbPool.query(`
        INSERT INTO participants (pool_id, wallet_address, joined_at)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
      `, [poolId, poolData.creator.toBase58().toLowerCase(), new Date(poolData.startTime.toNumber() * 1000)]);

      console.log(`✅ Creator added as participant`);

    } catch (err) {
      console.error(`❌ Error processing ${poolAddress}:`, err.message);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n✅ Done! Pool monitor will start processing pools automatically.\n');

  await dbPool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
