import { Connection, Commitment, PublicKey } from "@solana/web3.js";

// Dynamic network configuration based on environment - defaults to mainnet
const NETWORK = import.meta.env.VITE_SOLANA_NETWORK || "mainnet-beta";
const IS_MAINNET = !NETWORK.toLowerCase().includes("devnet");

// Primary RPC URL from environment, with fallbacks (mainnet by default)
const PRIMARY_RPC = import.meta.env.VITE_SOLANA_RPC_PRIMARY ||
  (IS_MAINNET
    ? "https://mainnet.helius-rpc.com/?api-key=3c5e3da7-9230-4336-9060-3b2aae17eb07"
    : "https://devnet.helius-rpc.com/?api-key=3c5e3da7-9230-4336-9060-3b2aae17eb07"
  );

const COMMITMENT: Commitment = "finalized";

export interface ConnectionInfo {
  endpoint: string;
  usingFallback: boolean;
  cluster: string;
  lastError: string | null;
}

let _connection: Connection | null = null;
let _connectionInfo: ConnectionInfo | null = null;

async function createConnection(): Promise<{ connection: Connection; info: ConnectionInfo }> {
  const cluster = IS_MAINNET ? "mainnet-beta" : "devnet";

  console.log(`[Connection] Using ${IS_MAINNET ? 'Mainnet' : 'Devnet'} RPC: ${PRIMARY_RPC}`);
  const connection = new Connection(PRIMARY_RPC, {
    commitment: COMMITMENT,
    confirmTransactionInitialTimeout: 60000,
    wsEndpoint: undefined, // Disable websocket to reduce errors
  });

  // Skip connectivity check - just use the connection directly
  // RPC may have intermittent connectivity, operations will retry as needed

  return {
    connection,
    info: { endpoint: PRIMARY_RPC, usingFallback: false, cluster, lastError: null }
  };
}

export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(PRIMARY_RPC, {
      commitment: COMMITMENT,
      confirmTransactionInitialTimeout: 60000,
      wsEndpoint: undefined,
    });
  }
  return _connection;
}

export function getConnectionInfo(): ConnectionInfo | null {
  return _connectionInfo;
}

export async function initConnection(): Promise<Connection> {
  const { connection, info } = await createConnection();
  _connection = connection;
  _connectionInfo = info;
  return _connection;
}

export async function resetConnection(): Promise<Connection> {
  _connection = null;
  _connectionInfo = null;
  return initConnection();
}

export async function getSolBalance(pubkey: PublicKey): Promise<number> {
  try {
    const conn = getConnection();
    const lamports = await conn.getBalance(pubkey, COMMITMENT);
    return lamports / 1e9;
  } catch (err: any) {
    console.error("[Connection] Failed to fetch SOL balance:", err);
    if (_connectionInfo) _connectionInfo.lastError = err.message;
    throw err;
  }
}

export async function checkConnection(): Promise<boolean> {
  try {
    const conn = getConnection();
    const { blockhash } = await conn.getLatestBlockhash(COMMITMENT);
    return !!blockhash;
  } catch {
    return false;
  }
}
