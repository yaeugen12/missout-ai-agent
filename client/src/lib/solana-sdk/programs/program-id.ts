import { PublicKey } from "@solana/web3.js";

/**
 * Get network configuration from environment
 */
function getNetwork(): "devnet" | "mainnet-beta" {
  const network = import.meta.env.VITE_SOLANA_NETWORK || "mainnet-beta"; // DEFAULT TO MAINNET
  return network.toLowerCase().includes("mainnet") ? "mainnet-beta" : "devnet";
}

const currentNetwork = getNetwork();
const isMainnet = currentNetwork === "mainnet-beta";

/**
 * Program ID - dynamically loaded based on network
 */
export const PROGRAM_ID = new PublicKey("4wgBJUHydWXXJKXYsmdGoGw1ufC3dxz8q2mukFYaAhSm");

/**
 * Development mint (devnet only)
 */
export const DEVNET_MINT = new PublicKey("HNcz9fndVXBogLjU55uyvbz79P5qWxaBZVKk7iRSy7jV");

/**
 * Standard SPL Token Program
 */
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

/**
 * Token-2022 Program
 */
export const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

/**
 * Associated Token Account Program
 */
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/**
 * Switchboard On-Demand Program ID
 * Mainnet: SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv
 * Devnet: Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2
 */
export const SWITCHBOARD_PROGRAM_ID = new PublicKey(
  isMainnet
    ? "SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv"
    : "Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2"
);

/**
 * Switchboard Queue
 * Can be overridden via VITE_SWITCHBOARD_QUEUE environment variable
 */
export const SWITCHBOARD_QUEUE = new PublicKey(
  import.meta.env.VITE_SWITCHBOARD_QUEUE ||
    (isMainnet
      ? "A43DyUGA7s8eXPxqEjJY6EBu1KKbNgfxF8h17VAHn13w" // Mainnet default
      : "EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7") // Devnet default
);

/**
 * Current network (devnet or mainnet-beta)
 */
export const NETWORK = currentNetwork;

/**
 * Check if running on mainnet
 */
export const IS_MAINNET = isMainnet;

/**
 * Log network configuration in development
 */
if (import.meta.env.DEV) {
  console.log(`🌐 Network: ${NETWORK}`);
  console.log(`📍 Program ID: ${PROGRAM_ID.toString()}`);
  console.log(`🔀 Switchboard: ${SWITCHBOARD_PROGRAM_ID.toString()}`);
  console.log(`📋 Queue: ${SWITCHBOARD_QUEUE.toString()}`);
}
