import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useWallet } from './use-wallet';
import { useNotifications } from './useNotifications';
import { NotificationType } from '@/types/notification';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

interface NotificationPayload {
  type: NotificationType;
  title: string;
  message: string;
  poolId: number;
  poolName: string;
  randomness?: string;
  verifyUrl?: string;
}

/**
 * Hook to connect to WebSocket server and receive real-time notifications
 */
export function useWebSocketNotifications() {
  const { address } = useWallet();
  const { addNotification, addPastNotification } = useNotifications();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!address) {
      // Disconnect if wallet disconnected
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    // Connect to WebSocket server
    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[WebSocket] Connected to notification server');

      // Register wallet address
      socket.emit('register', address);
    });

    socket.on('disconnect', () => {
      console.log('[WebSocket] Disconnected from notification server');
    });

    // Real-time notification (when online)
    socket.on('notification', (payload: NotificationPayload) => {
      console.log('[WebSocket] Received real-time notification:', payload);

      // Add notification to local state
      addNotification({
        type: payload.type,
        title: payload.title,
        message: payload.message,
        poolId: payload.poolId,
        poolName: payload.poolName,
      });
    });

    // Past notifications (when connecting - includes offline notifications)
    socket.on('past-notifications', (notifications: Array<any>) => {
      console.log(`[WebSocket] Received ${notifications.length} past notifications from database`);

      // Add all past notifications to local state (preserves DB id, timestamp, read status)
      notifications.forEach((dbNotification) => {
        addPastNotification({
          id: String(dbNotification.id),
          type: dbNotification.type as NotificationType,
          title: dbNotification.title,
          message: dbNotification.message,
          poolId: dbNotification.poolId,
          poolName: dbNotification.poolName,
          timestamp: new Date(dbNotification.createdAt).getTime(),
          read: dbNotification.read === 1, // DB stores 0/1, convert to boolean
        });
      });
    });

    socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error);
    });

    // Cleanup on unmount or address change
    return () => {
      if (socket) {
        socket.emit('unregister', address);
        socket.disconnect();
      }
    };
  }, [address, addNotification, addPastNotification]);

  return {
    isConnected: socketRef.current?.connected || false,
  };
}
