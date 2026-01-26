import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=3c5e3da7-9230-4336-9060-3b2aae17eb07';
const CREATOR_WALLET = new PublicKey('HeXjPXForQumceDJHA6w5d4vPR11mPMDGmtcz5ZHezBZ');
const PROGRAM_ID = new PublicKey('4wgBJUHydWXXJKXYsmdGoGw1ufC3dxz8q2mukFYaAhSm');

async function main() {
  const conn = new Connection(RPC_URL, 'confirmed');

  console.log('\n=== GETTING CREATOR TRANSACTIONS ===\n');
  console.log('Creator:', CREATOR_WALLET.toBase58());
  console.log('Program:', PROGRAM_ID.toBase58());

  // Get recent signatures
  const sigs = await conn.getSignaturesForAddress(CREATOR_WALLET, { limit: 50 });

  console.log(`\nFound ${sigs.length} recent transactions\n`);

  for (const sig of sigs) {
    try {
      const tx = await conn.getParsedTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });

      if (!tx) continue;

      // Check if transaction involves our program
      const invokesProgramId = tx.transaction.message.accountKeys.some(
        key => key.pubkey.toBase58() === PROGRAM_ID.toBase58()
      );

      if (!invokesProgramId) continue;

      // Check logs for CreatePool
      const logs = tx.meta?.logMessages || [];
      const isCreatePool = logs.some(log => log.includes('CreatePool'));

      if (isCreatePool) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('CREATE POOL TX:', sig.signature);
        console.log('Block time:', new Date(sig.blockTime * 1000).toISOString());

        // Find pool account in post token balances or account keys
        const accounts = tx.transaction.message.accountKeys;
        console.log('\nAccounts in transaction:');
        accounts.forEach((acc, idx) => {
          console.log(`  ${idx}: ${acc.pubkey.toBase58()}${acc.writable ? ' (writable)' : ''}`);
        });

        console.log('\nLogs:');
        logs.forEach(log => console.log('  ', log));
        console.log('');
      }
    } catch (err) {
      console.error('Error processing', sig.signature, ':', err.message);
    }
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
