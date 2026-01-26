import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

const PROGRAM_ID = new PublicKey('4wgBJUHydWXXJKXYsmdGoGw1ufC3dxz8q2mukFYaAhSm');
const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=3c5e3da7-9230-4336-9060-3b2aae17eb07';

// Pool discriminator
const POOL_DISCRIMINATOR = [241, 154, 109, 4, 17, 177, 109, 188];

async function main() {
  console.log('\n=== ALL POOL ADDRESSES ===\n');
  console.log('Program:', PROGRAM_ID.toBase58());

  const conn = new Connection(RPC_URL, 'confirmed');

  const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(Buffer.from(POOL_DISCRIMINATOR)),
        },
      },
    ],
  });

  console.log(`\nFound ${accounts.length} pools\n`);

  for (const { pubkey } of accounts) {
    const addr = pubkey.toBase58();
    console.log(addr);
    console.log(`  https://solscan.io/account/${addr}`);
    console.log('');
  }

  console.log('\n=== KNOWN POOL 3 ===');
  console.log('HppvCrkSWB1qp6QnJkJ4EGbtc1qpsp11ZUMNnVyYJyin');
  console.log('https://solscan.io/account/HppvCrkSWB1qp6QnJkJ4EGbtc1qpsp11ZUMNnVyYJyin');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
