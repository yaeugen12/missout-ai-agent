import { PublicKey } from "@solana/web3.js";

/**
 * Network configuration for Solana
 * Supports both devnet and mainnet-beta
 */

export type SolanaNetwork = "devnet" | "mainnet-beta";

export interface NetworkConfig {
  network: SolanaNetwork;
  rpcUrl: string;
  programId: PublicKey;
  switchboard: {
    programId: PublicKey;
    queue: PublicKey;
  };
}

/**
 * Devnet configuration
 */
export const DEVNET_CONFIG: NetworkConfig = {
  network: "devnet",
  rpcUrl: "https://api.devnet.solana.com",
  programId: new PublicKey("4wgBJUHydWXXJKXYsmdGoGw1ufC3dxz8q2mukFYaAhSm"),
  switchboard: {
    programId: new PublicKey("Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2"),
    queue: new PublicKey("EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7"),
  },
};

/**
 * Mainnet-beta configuration
 * IMPORTANT: Deploy your program to mainnet and update the programId
 */
export const MAINNET_CONFIG: NetworkConfig = {
  network: "mainnet-beta",
  rpcUrl: "https://api.mainnet-beta.solana.com",
  // TODO: Update this with your mainnet program ID after deployment
  programId: new PublicKey("4wgBJUHydWXXJKXYsmdGoGw1ufC3dxz8q2mukFYaAhSm"),
  switchboard: {
    // Mainnet Switchboard On-Demand
    programId: new PublicKey("SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv"),
    // TODO: Get mainnet queue from https://docs.switchboard.xyz/docs/switchboard/on-demand
    queue: new PublicKey("A43DyUGA7s8eXPxqEjJY6EBu1KKbNgfxF8h17VAHn13w"),
  },
};

/**
 * Get network configuration based on environment
 * @param network - Network name from environment variable
 * @param customRpcUrl - Optional custom RPC URL to override default
 * @returns Network configuration
 */
export function getNetworkConfig(
  network?: string,
  customRpcUrl?: string
): NetworkConfig {
  const networkName = (network || "devnet").toLowerCase();

  let config: NetworkConfig;

  switch (networkName) {
    case "mainnet-beta":
    case "mainnet":
      config = { ...MAINNET_CONFIG };
      break;
    case "devnet":
    default:
      config = { ...DEVNET_CONFIG };
      break;
  }

  // Override RPC URL if provided
  if (customRpcUrl) {
    config.rpcUrl = customRpcUrl;
  }

  return config;
}

/**
 * Validate network configuration
 * Ensures all required fields are present
 */
export function validateNetworkConfig(config: NetworkConfig): void {
  if (!config.network) {
    throw new Error("Network configuration missing: network");
  }

  if (!config.rpcUrl) {
    throw new Error("Network configuration missing: rpcUrl");
  }

  if (!config.programId) {
    throw new Error("Network configuration missing: programId");
  }

  if (!config.switchboard.programId) {
    throw new Error("Network configuration missing: switchboard.programId");
  }

  if (!config.switchboard.queue) {
    throw new Error("Network configuration missing: switchboard.queue");
  }

  // Validate URLs
  if (!config.rpcUrl.startsWith("http://") && !config.rpcUrl.startsWith("https://")) {
    throw new Error(`Invalid RPC URL: ${config.rpcUrl}`);
  }

  // Warning for production
  if (config.network === "mainnet-beta") {
    const isDefaultProgramId =
      config.programId.toString() === "4wgBJUHydWXXJKXYsmdGoGw1ufC3dxz8q2mukFYaAhSm";

    if (isDefaultProgramId) {
      console.warn(
        "⚠️  WARNING: Using devnet program ID on mainnet! Update MAINNET_CONFIG.programId"
      );
    }
  }
}

/**
 * Get current network from environment
 */
export function getCurrentNetwork(): SolanaNetwork {
  const network = process.env.SOLANA_NETWORK || process.env.VITE_SOLANA_NETWORK || "devnet";
  return network.toLowerCase().includes("mainnet") ? "mainnet-beta" : "devnet";
}

/**
 * Check if running on mainnet
 */
export function isMainnet(): boolean {
  return getCurrentNetwork() === "mainnet-beta";
}

/**
 * Check if running on devnet
 */
export function isDevnet(): boolean {
  return getCurrentNetwork() === "devnet";
}
