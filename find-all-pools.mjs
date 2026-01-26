import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { IDL } from './shared/idl.ts';

const PROGRAM_ID = new PublicKey('4wgBJUHydWXXJKXYsmdGoGw1ufC3dxz8q2mukFYaAhSm');
const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=3c5e3da7-9230-4336-9060-3b2aae17eb07';
const CREATOR_WALLET = 'HeXjPXForQumceDJHA6w5d4vPR11mPMDGmtcz5ZHezBZ'; // deployer wallet

async function main() {
  console.log('\n=== FINDING ALL POOLS ON-CHAIN ===\n');
  console.log('Program ID:', PROGRAM_ID.toBase58());
  console.log('Creator wallet:', CREATOR_WALLET);

  const conn = new Connection(RPC_URL, 'confirmed');
  const wallet = { publicKey: PublicKey.default };
  const provider = new AnchorProvider(conn, wallet, {});
  const program = new Program(IDL, PROGRAM_ID, provider);

  // Get all Pool accounts
  const pools = await program.account.pool.all();

  console.log(`\nFound ${pools.length} total pools on-chain\n`);

  // Filter by creator
  const creatorPools = pools.filter(p =>
    p.account.creator.toBase58() === CREATOR_WALLET
  );

  console.log(`Found ${creatorPools.length} pools created by ${CREATOR_WALLET}\n`);

  for (const pool of creatorPools) {
    const addr = pool.publicKey.toBase58();
    const status = Object.keys(pool.account.status)[0];
    const participants = pool.account.participantsCount;
    const devWallet = pool.account.devWallet.toBase58();
    const treasuryWallet = pool.account.treasuryWallet.toBase58();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Pool Address:', addr);
    console.log('Status:', status);
    console.log('Participants:', participants);
    console.log('Dev Wallet:', devWallet);
    console.log('Treasury Wallet:', treasuryWallet);
    console.log('Creator:', pool.account.creator.toBase58());
    console.log('Mint:', pool.account.mint.toBase58());
    console.log('Entry Amount:', pool.account.entryAmount.toString());
    console.log('Total Pot:', pool.account.totalPot.toString());

    if (pool.account.winner) {
      console.log('Winner:', pool.account.winner.toBase58());
    }

    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
