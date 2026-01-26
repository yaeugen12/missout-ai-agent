import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

const PROGRAM_ID = new PublicKey('4wgBJUHydWXXJKXYsmdGoGw1ufC3dxz8q2mukFYaAhSm');
const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=3c5e3da7-9230-4336-9060-3b2aae17eb07';
const CREATOR_WALLET = new PublicKey('HeXjPXForQumceDJHA6w5d4vPR11mPMDGmtcz5ZHezBZ');

// Pool discriminator: First 8 bytes of SHA256("account:Pool")
const POOL_DISCRIMINATOR = [241, 154, 109, 4, 17, 177, 109, 188];

async function main() {
  console.log('\n=== FINDING POOLS ===\n');
  console.log('Program:', PROGRAM_ID.toBase58());
  console.log('Creator:', CREATOR_WALLET.toBase58());

  const conn = new Connection(RPC_URL, 'confirmed');

  // Get all program accounts with Pool discriminator
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

  console.log(`\nFound ${accounts.length} total pools\n`);

  const allPools = [];
  const creatorPools = [];

  for (const { pubkey, account } of accounts) {
    const data = account.data;

    // Parse pool data
    // Offset 8 (discriminator) + 1 (status) + 4 (participants_count) + 8 (entry_amount) + 8 (total_pot) = 29
    // Then: dev_wallet(32) + treasury_wallet(32) + creator(32)

    // Creator is at offset: 8 + 1 + 4 + 8 + 8 + 32 + 32 = 93
    const creatorOffset = 93;
    const creatorBytes = data.slice(creatorOffset, creatorOffset + 32);
    const creator = new PublicKey(creatorBytes);

    // Parse more data
    const statusByte = data[8];
    const participantsCount = data.readUInt32LE(9);

    // Dev wallet at offset 29
    const devWalletBytes = data.slice(29, 61);
    const devWallet = new PublicKey(devWalletBytes);

    // Treasury wallet at offset 61
    const treasuryWalletBytes = data.slice(61, 93);
    const treasuryWallet = new PublicKey(treasuryWalletBytes);

    // Winner at offset 125 (after creator 32 bytes)
    const winnerBytes = data.slice(125, 157);
    const winner = new PublicKey(winnerBytes);
    const hasWinner = !winner.equals(PublicKey.default);

    // Mint at offset 261
    const mintBytes = data.slice(261, 293);
    const mint = new PublicKey(mintBytes);

    const statusNames = ['Open', 'Locked', 'Unlocked', 'RandomnessCommitted', 'RandomnessRevealed', 'WinnerSelected', 'Ended'];
    const status = statusNames[statusByte] || `Unknown(${statusByte})`;

    const poolInfo = {
      address: pubkey.toBase58(),
      status,
      participantsCount,
      devWallet: devWallet.toBase58(),
      treasuryWallet: treasuryWallet.toBase58(),
      creator: creator.toBase58(),
      mint: mint.toBase58(),
      winner: hasWinner ? winner.toBase58() : 'None',
    };

    allPools.push(poolInfo);

    if (creator.toBase58() === CREATOR_WALLET.toBase58()) {
      creatorPools.push(poolInfo);
    }
  }

  console.log('=== ALL POOLS ===\n');
  for (const pool of allPools) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Pool Address:', pool.address);
    console.log('Status:', pool.status);
    console.log('Participants:', pool.participantsCount);
    console.log('Creator:', pool.creator);
    console.log('Dev Wallet:', pool.devWallet);
    console.log('Treasury Wallet:', pool.treasuryWallet);
    console.log('Mint:', pool.mint);
    console.log('Winner:', pool.winner);
    console.log('');
  }

  console.log(`\n=== POOLS BY ${CREATOR_WALLET.toBase58().slice(0, 8)}... ===\n`);
  console.log(`Found ${creatorPools.length} pools\n`);

  for (const pool of creatorPools) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Pool Address:', pool.address);
    console.log('Status:', pool.status);
    console.log('Participants:', pool.participantsCount);
    console.log('Dev Wallet:', pool.devWallet);
    console.log('Treasury Wallet:', pool.treasuryWallet);
    console.log('Mint:', pool.mint);
    console.log('Winner:', pool.winner);
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
