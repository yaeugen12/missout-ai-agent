#!/usr/bin/env node
/**
 * IPv6-to-IPv4 Proxy for Supabase Database Connection
 *
 * This proxy listens on IPv4 localhost and forwards connections to IPv6 Supabase.
 * Use this as a workaround when WSL2 doesn't have proper IPv6 routing.
 */

const net = require('net');
const dns = require('dns');

const LOCAL_PORT = 15432;
const REMOTE_HOST = 'db.xaorwyhupaenqwqshanp.supabase.co';
const REMOTE_PORT = 5432;

// Resolve the IPv6 address
dns.resolve6(REMOTE_HOST, (err, addresses) => {
  if (err) {
    console.error('Failed to resolve IPv6 address:', err.message);
    process.exit(1);
  }

  const remoteIPv6 = addresses[0];
  console.log(`Resolved ${REMOTE_HOST} to ${remoteIPv6}`);

  // Create proxy server
  const server = net.createServer((clientSocket) => {
    console.log(`New connection from ${clientSocket.remoteAddress}:${clientSocket.remotePort}`);

    // Connect to remote IPv6 server
    const remoteSocket = net.connect({
      host: remoteIPv6,
      port: REMOTE_PORT,
      family: 6, // Force IPv6
    });

    // Pipe data between client and remote
    clientSocket.pipe(remoteSocket);
    remoteSocket.pipe(clientSocket);

    // Handle errors
    clientSocket.on('error', (err) => {
      console.error('Client socket error:', err.message);
      remoteSocket.destroy();
    });

    remoteSocket.on('error', (err) => {
      console.error('Remote socket error:', err.message);
      clientSocket.destroy();
    });

    // Handle close
    clientSocket.on('close', () => {
      console.log('Client disconnected');
      remoteSocket.destroy();
    });

    remoteSocket.on('close', () => {
      console.log('Remote disconnected');
      clientSocket.destroy();
    });
  });

  server.listen(LOCAL_PORT, '127.0.0.1', () => {
    console.log(`\nIPv6 Proxy running on 127.0.0.1:${LOCAL_PORT}`);
    console.log(`Forwarding to ${REMOTE_HOST} (${remoteIPv6}):${REMOTE_PORT}\n`);
    console.log(`Update your .env to use:`);
    console.log(`DIRECT_DATABASE_URL=postgresql://postgres:MbZXJzdj4dzpAPgl@127.0.0.1:${LOCAL_PORT}/postgres\n`);
  });

  server.on('error', (err) => {
    console.error('Server error:', err.message);
    process.exit(1);
  });
});
