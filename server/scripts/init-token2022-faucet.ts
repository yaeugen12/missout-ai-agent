import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config();

const TOKEN2022_MINT = process.env.TOKEN2022_DEVNET_MINT || "BhzvZjrFpMtmCamkuPvc1tfrdQHaVovRzvFhqgVj2yRH";
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const AUTHORITY_KEY = process.env.DEV_WALLET_PRIVATE_KEY;

async function initToken2022Faucet() {
  if (!AUTHORITY_KEY) {
    console.error("❌ DEV_WALLET_PRIVATE_KEY not found in .env");
    process.exit(1);
  }

  const connection = new Connection(RPC_URL, "confirmed");
  const authority = Keypair.fromSecretKey(bs58.decode(AUTHORITY_KEY));
  const mint = new PublicKey(TOKEN2022_MINT);

  console.log("🚀 Initializing Token-2022 Faucet");
  console.log("Authority:", authority.publicKey.toBase58());
  console.log("Mint:", mint.toBase58());
  console.log("Token Program:", TOKEN_2022_PROGRAM_ID.toBase58());

  // Get ATA address
  const ata = await getAssociatedTokenAddress(
    mint,
    authority.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  console.log("\n📍 Authority Token Account:", ata.toBase58());

  // Check if ATA exists
  try {
    const account = await getAccount(connection, ata, undefined, TOKEN_2022_PROGRAM_ID);
    const balance = Number(account.amount) / 1e9; // Assuming 9 decimals
    console.log(`\n✅ Token account already exists!`);
    console.log(`💰 Current balance: ${balance.toLocaleString()} tokens`);

    if (balance < 1000000) {
      console.log(`\n⚠️  WARNING: Balance is low (${balance.toLocaleString()} tokens)`);
      console.log("You need to send Token-2022 tokens to this account:");
      console.log(`   ${ata.toBase58()}`);
    } else {
      console.log(`\n✅ Faucet is ready with ${balance.toLocaleString()} tokens`);
    }
  } catch (error: any) {
    if (error.message.includes("could not find account")) {
      console.log("\n⚠️  Token account does NOT exist yet");
      console.log("\n📝 To initialize the faucet:");
      console.log("1. Create the ATA by sending Token-2022 tokens to:");
      console.log(`   ${ata.toBase58()}`);
      console.log("\n2. Or run this command to create empty ATA (requires SOL for rent):");
      console.log(`   spl-token create-account ${mint.toBase58()} --owner ${authority.publicKey.toBase58()} --program-id ${TOKEN_2022_PROGRAM_ID.toBase58()}`);
    } else {
      console.error("\n❌ Error checking account:", error.message);
    }
  }

  console.log("\n" + "=".repeat(80));
}

initToken2022Faucet().catch(console.error);
