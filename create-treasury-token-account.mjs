import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';

const POOL_ADDRESS = 'HppvCrkSWB1qp6QnJkJ4EGbtc1qpsp11ZUMNnVyYJyin';
const TREASURY_PRIVATE_KEY = '3Va6hzRnqb6D9WDoVanArBwiwPxrGyc5HDjQ9Xgc1MpPj59dXnupjHSVonYScepo5zxiRqDWGeDNjkzYuNwQJg5w';
const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=05e34de2-ae9a-48ed-b0e8-dcca16734e3c';
const PROGRAM_ID = new PublicKey('4wgBJUHydWXXJKXYsmdGoGw1ufC3dxz8q2mukFYaAhSm');

async function main() {
  const conn = new Connection(RPC_URL, 'confirmed');
  const payer = Keypair.fromSecretKey(bs58.decode(TREASURY_PRIVATE_KEY));

  console.log('Treasury wallet:', payer.publicKey.toBase58());
  console.log('Pool address:', POOL_ADDRESS);

  // Fetch pool account
  const poolPk = new PublicKey(POOL_ADDRESS);
  const poolAccountInfo = await conn.getAccountInfo(poolPk);

  if (!poolAccountInfo) {
    throw new Error('Pool account not found');
  }

  // Parse pool data to get mint
  // Pool struct: discriminator(8) + status(1) + participants_count(4) + entry_amount(8) + total_pot(8) +
  //              dev_wallet(32) + treasury_wallet(32) + creator(32) + winner(32) + start_time(8) +
  //              lock_time(8) + unlock_time(8) + randomness_account(32) + commit_slot(8) + reveal_slot(8) +
  //              randomness_value([u8;32]) + mint(32) + ...

  const data = poolAccountInfo.data;

  // Mint is at offset 8+1+4+8+8+32+32+32+32+8+8+8+32+8+8+32 = 261
  const mintOffset = 261;
  const mintBytes = data.slice(mintOffset, mintOffset + 32);
  const mint = new PublicKey(mintBytes);

  console.log('Pool mint:', mint.toBase58());

  // Determine token program (check if Token-2022 or SPL Token)
  const mintAccountInfo = await conn.getAccountInfo(mint);
  let tokenProgramId = TOKEN_PROGRAM_ID;

  if (mintAccountInfo && mintAccountInfo.owner.toBase58() === TOKEN_2022_PROGRAM_ID.toBase58()) {
    tokenProgramId = TOKEN_2022_PROGRAM_ID;
    console.log('Using Token-2022 program');
  } else {
    console.log('Using SPL Token program');
  }

  // Get treasury's associated token address
  const treasuryToken = getAssociatedTokenAddressSync(
    mint,
    payer.publicKey,
    false,
    tokenProgramId
  );

  console.log('Treasury token account:', treasuryToken.toBase58());

  // Check if it exists
  const treasuryTokenInfo = await conn.getAccountInfo(treasuryToken);

  if (treasuryTokenInfo) {
    console.log('✅ Treasury token account already exists!');
    return;
  }

  console.log('❌ Treasury token account does not exist. Creating...');

  // Create the account
  const ix = createAssociatedTokenAccountInstruction(
    payer.publicKey,  // payer
    treasuryToken,    // ata
    payer.publicKey,  // owner
    mint,             // mint
    tokenProgramId    // token program
  );

  const tx = new Transaction();
  const bh = await conn.getLatestBlockhash();
  tx.recentBlockhash = bh.blockhash;
  tx.feePayer = payer.publicKey;
  tx.add(ix);

  tx.sign(payer);

  const sig = await conn.sendRawTransaction(tx.serialize());
  console.log('TX sent:', sig);

  await conn.confirmTransaction(sig, 'confirmed');
  console.log('✅ Treasury token account created!');
  console.log('Explorer:', `https://explorer.solana.com/tx/${sig}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
