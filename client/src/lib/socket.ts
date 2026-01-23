import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
  autoConnect: true,
});

// Log connection status for debugging
socket.on('connect', () => {
  console.log('[Socket] Connected to WebSocket server');
});

socket.on('disconnect', () => {
  console.log('[Socket] Disconnected from WebSocket server');
});

socket.on('connect_error', (error) => {
  console.error('[Socket] Connection error:', error);
});
