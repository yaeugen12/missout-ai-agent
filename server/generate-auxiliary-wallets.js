// Generate 9 auxiliary wallets for sponsored pool system
import { Keypair } from '@solana/web3.js/lib/index.cjs.js';
import bs58 from 'bs58';

console.log('Generating 9 auxiliary wallets for free pool system...\n');
console.log('Add these to your /server/.env file:\n');

for (let i = 0; i < 9; i++) {
  const keypair = Keypair.generate();
  const privateKey = bs58.encode(keypair.secretKey);
  const publicKey = keypair.publicKey.toBase58();

  console.log(`# Auxiliary Wallet ${i + 1}`);
  console.log(`AUXILIARY_WALLET_${i + 1}_PRIVATE_KEY=${privateKey}`);
  console.log(`AUXILIARY_WALLET_${i + 1}_PUBKEY=${publicKey}`);
  console.log('');
}

console.log('\n✅ Generated 9 auxiliary wallets successfully!');
console.log('⚠️  IMPORTANT: Fund each wallet with enough SOL and tokens for testing.');
