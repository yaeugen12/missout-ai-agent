import { Connection, Commitment, PublicKey } from "@solana/web3.js";

// STRICT DEVNET LOCK - HELIUS ONLY
// Use the standard Helius devnet format
const HELIUS_RPC = "https://devnet.helius-rpc.com/?api-key=3c5e3da7-9230-4336-9060-3b2aae17eb07";
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
  const cluster = "devnet";
  
  console.log(`[Connection] Using Helius Devnet RPC: ${HELIUS_RPC}`);
  const connection = new Connection(HELIUS_RPC, {
    commitment: COMMITMENT,
    confirmTransactionInitialTimeout: 60000,
    wsEndpoint: undefined, // Disable websocket to reduce errors
  });
  
  // Runtime Guard
  if (connection.rpcEndpoint.includes('mainnet')) {
    throw new Error('CRITICAL: MAINNET RPC DETECTED - BLOCKING');
  }

  // Skip connectivity check - just use the connection directly
  // Helius devnet may have intermittent connectivity, operations will retry as needed

  return {
    connection,
    info: { endpoint: HELIUS_RPC, usingFallback: false, cluster, lastError: null }
  };
}

export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(HELIUS_RPC, { 
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
