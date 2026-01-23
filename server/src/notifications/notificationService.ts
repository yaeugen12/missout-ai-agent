import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { logger } from '../logger.js';
import { storage } from '../storage.js';

export enum NotificationType {
  JOIN = 'join',
  UNLOCKED = 'unlocked',
  RANDOMNESS = 'randomness',
  WIN = 'win',
  CANCEL = 'cancel',
}

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  message: string;
  poolId: number;
  poolName: string;
  randomness?: string;
  verifyUrl?: string;
}

class NotificationService {
  private io: SocketIOServer | null = null;
  private walletToSocketMap = new Map<string, Set<string>>(); // wallet -> socketIds

  initialize(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: [
          "https://www.missout.fun",
          process.env.FRONTEND_URL,
          process.env.CLIENT_URL,
          "http://localhost:5173"
        ].filter(Boolean),
        credentials: true,
        methods: ["GET", "POST"],
      },
    });

    this.io.on('connection', (socket) => {
      logger.info(`[NOTIFICATIONS] Client connected: ${socket.id}`);

      // Register wallet address
      socket.on('register', async (walletAddress: string) => {
        if (!walletAddress) return;

        const normalizedWallet = walletAddress.toLowerCase();

        if (!this.walletToSocketMap.has(normalizedWallet)) {
          this.walletToSocketMap.set(normalizedWallet, new Set());
        }

        this.walletToSocketMap.get(normalizedWallet)!.add(socket.id);

        logger.info(`[NOTIFICATIONS] Wallet ${normalizedWallet.slice(0, 8)} registered with socket ${socket.id}`);

        // 📬 SEND PAST NOTIFICATIONS from database
        try {
          const pastNotifications = await storage.getNotifications(normalizedWallet, 50);
          if (pastNotifications.length > 0) {
            logger.info(`[NOTIFICATIONS] Sending ${pastNotifications.length} past notifications to ${normalizedWallet.slice(0, 8)}`);
            socket.emit('past-notifications', pastNotifications);
          }
        } catch (err: any) {
          logger.error(`[NOTIFICATIONS] Failed to load past notifications for ${normalizedWallet.slice(0, 8)}:`, err.message);
        }
      });

      socket.on('unregister', (walletAddress: string) => {
        if (!walletAddress) return;

        const normalizedWallet = walletAddress.toLowerCase();
        const socketIds = this.walletToSocketMap.get(normalizedWallet);

        if (socketIds) {
          socketIds.delete(socket.id);
          if (socketIds.size === 0) {
            this.walletToSocketMap.delete(normalizedWallet);
          }
        }

        logger.info(`[NOTIFICATIONS] Wallet ${normalizedWallet.slice(0, 8)} unregistered from socket ${socket.id}`);
      });

      // Pool Chat - Join room
      socket.on('join-pool-chat', (poolId: number) => {
        if (!poolId || isNaN(poolId)) return;
        socket.join(`pool-${poolId}`);
        logger.info(`[CHAT] Socket ${socket.id} joined pool-${poolId} chat`);
      });

      // Pool Chat - Leave room
      socket.on('leave-pool-chat', (poolId: number) => {
        if (!poolId || isNaN(poolId)) return;
        socket.leave(`pool-${poolId}`);
        logger.info(`[CHAT] Socket ${socket.id} left pool-${poolId} chat`);
      });

      // Pool Price Updates - Join room
      socket.on('join-pool-price', (poolId: number) => {
        if (!poolId || isNaN(poolId)) return;
        socket.join(`pool:${poolId}`);
        logger.info(`[PRICE] Socket ${socket.id} joined pool:${poolId} price updates`);
      });

      // Pool Price Updates - Leave room
      socket.on('leave-pool-price', (poolId: number) => {
        if (!poolId || isNaN(poolId)) return;
        socket.leave(`pool:${poolId}`);
        logger.info(`[PRICE] Socket ${socket.id} left pool:${poolId} price updates`);
      });

      socket.on('disconnect', () => {
        // Remove socket from all wallets
        let disconnectedWallet: string | null = null;
        for (const [wallet, socketIds] of this.walletToSocketMap.entries()) {
          if (socketIds.has(socket.id)) {
            disconnectedWallet = wallet;
          }
          socketIds.delete(socket.id);
          if (socketIds.size === 0) {
            this.walletToSocketMap.delete(wallet);
          }
        }

        logger.info(`[NOTIFICATIONS] Client disconnected: ${socket.id}`, {
          wallet: disconnectedWallet ? disconnectedWallet.slice(0, 8) : 'unknown',
          remainingConnections: this.walletToSocketMap.size
        });
      });
    });

    logger.info('[NOTIFICATIONS] WebSocket service initialized');
  }

  /**
   * Send notification to specific wallet addresses
   * IMPORTANT: Saves to database for ALL wallets (online + offline)
   * Only sends real-time WebSocket to ONLINE wallets
   */
  async notifyWallets(wallets: string[], notification: NotificationPayload) {
    const normalizedWallets = wallets.map(w => w.toLowerCase());

    // 📀 SAVE TO DATABASE for ALL wallets (online + offline)
    const dbSavePromises = normalizedWallets.map(wallet =>
      storage.createNotification({
        walletAddress: wallet,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        poolId: notification.poolId,
        poolName: notification.poolName,
        randomness: notification.randomness,
        verifyUrl: notification.verifyUrl,
        read: 0,
      }).catch(err => {
        logger.error('[NOTIFICATIONS] Failed to save notification to DB', {
          wallet: wallet.slice(0, 8),
          error: err.message
        });
      })
    );

    await Promise.all(dbSavePromises);
    logger.info(`[NOTIFICATIONS] ${notification.type.toUpperCase()} saved to DB for ${normalizedWallets.length} wallets`);

    // 📡 SEND REAL-TIME WebSocket for ONLINE wallets only
    if (!this.io) {
      logger.warn('[NOTIFICATIONS] Socket.IO not initialized - notifications saved to DB only');
      return;
    }

    let sentCount = 0;
    const notifiedWallets: string[] = [];
    const offlineWallets: string[] = [];

    for (const wallet of normalizedWallets) {
      const socketIds = this.walletToSocketMap.get(wallet);

      if (socketIds && socketIds.size > 0) {
        for (const socketId of socketIds) {
          this.io.to(socketId).emit('notification', notification);
          sentCount++;
        }
        notifiedWallets.push(wallet.slice(0, 8));
      } else {
        offlineWallets.push(wallet.slice(0, 8));
      }
    }

    logger.info(`[NOTIFICATIONS] ${notification.type.toUpperCase()} sent via WebSocket`, {
      poolId: notification.poolId,
      totalWallets: wallets.length,
      onlineNotified: notifiedWallets,
      offline: offlineWallets.length > 0 ? offlineWallets : undefined,
      connectedWallets: Array.from(this.walletToSocketMap.keys()).map(w => w.slice(0, 8))
    });
  }

  /**
   * Notify all participants in a pool (creator + all participants)
   * Uses Set to avoid duplicates if creator is also a participant
   */
  async notifyPoolParticipants(
    creatorWallet: string,
    participants: Array<{ wallet: string }>,
    notification: NotificationPayload
  ) {
    // Use Set to avoid duplicates (creator might also be a participant)
    const uniqueWallets = Array.from(new Set([
      creatorWallet.toLowerCase(),
      ...participants.map(p => p.wallet.toLowerCase())
    ]));

    logger.info(`[NOTIFICATIONS] ${notification.type.toUpperCase()} - notifying ${uniqueWallets.length} unique wallets`, {
      poolId: notification.poolId,
      wallets: uniqueWallets.map(w => w.slice(0, 8))
    });

    await this.notifyWallets(uniqueWallets, notification);
  }

  /**
   * Notify only participants (excluding creator)
   */
  async notifyParticipantsOnly(
    participants: Array<{ wallet: string }>,
    notification: NotificationPayload
  ) {
    const wallets = participants.map(p => p.wallet);
    await this.notifyWallets(wallets, notification);
  }

  getConnectedWallets(): string[] {
    return Array.from(this.walletToSocketMap.keys());
  }

  getStats() {
    return {
      connectedWallets: this.walletToSocketMap.size,
      totalSockets: Array.from(this.walletToSocketMap.values())
        .reduce((sum, set) => sum + set.size, 0),
    };
  }

  /**
   * Get Socket.IO instance (for price update job)
   */
  getIO(): SocketIOServer | null {
    return this.io;
  }

  /**
   * Broadcast new winner to ALL connected clients (for live winners feed)
   */
  broadcastNewWinner(winnerData: any) {
    if (!this.io) {
      logger.warn('[NOTIFICATIONS] Cannot broadcast new winner - socket.io not initialized');
      return;
    }

    this.io.emit('new-winner', winnerData);
    logger.info(`[NOTIFICATIONS] NEW WINNER broadcasted globally`, {
      winner: winnerData.displayName,
      roi: `${winnerData.roiPercent.toFixed(0)}%`
    });
  }

  /**
   * Broadcast real-time price update to all clients watching a pool
   */
  broadcastPriceUpdate(poolId: number, priceUsd: number) {
    if (!this.io) {
      logger.warn('[PRICE] Socket.IO not initialized');
      return;
    }

    // Broadcast to room named `pool:${poolId}` for pool watchers
    this.io.to(`pool:${poolId}`).emit('price-update', {
      poolId,
      priceUsd,
      timestamp: Date.now(),
    });

    logger.debug(`[PRICE] Price update broadcast to pool ${poolId}: $${priceUsd.toFixed(6)}`);
  }

  /**
   * Broadcast chat message to all connected clients watching a pool
   */
  broadcastChatMessage(poolId: number, message: any) {
    if (!this.io) {
      logger.warn('[CHAT] Socket.IO not initialized');
      return;
    }

    // Broadcast to room named after poolId
    this.io.to(`pool-${poolId}`).emit('chat-message', message);

    logger.info(`[CHAT] Message broadcast to pool ${poolId}`, {
      poolId,
      sender: message.walletAddress?.slice(0, 8),
    });
  }

  /**
   * Join a pool chat room (for receiving chat messages)
   */
  joinPoolChat(socketId: string, poolId: number) {
    const socket = this.io?.sockets.sockets.get(socketId);
    if (socket) {
      socket.join(`pool-${poolId}`);
      logger.info(`[CHAT] Socket ${socketId} joined pool-${poolId}`);
    }
  }

  /**
   * Leave a pool chat room
   */
  leavePoolChat(socketId: string, poolId: number) {
    const socket = this.io?.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(`pool-${poolId}`);
      logger.info(`[CHAT] Socket ${socketId} left pool-${poolId}`);
    }
  }
}

export const notificationService = new NotificationService();
