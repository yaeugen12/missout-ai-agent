import { useEffect, useRef } from 'react';
import { useNotifications } from './useNotifications';
import { useWallet } from './use-wallet';
import { NotificationType } from '@/types/notification';
import type { Pool } from '@/types/shared';

interface PoolNotificationOptions {
  pools: Pool[];
  isLoading: boolean;
}

/**
 * Hook that monitors pool state changes and triggers notifications
 */
export function usePoolNotifications({ pools, isLoading }: PoolNotificationOptions) {
  const { addNotification } = useNotifications();
  const { address } = useWallet();
  const previousPoolsRef = useRef<Record<number, Pool>>({});

  useEffect(() => {
    if (isLoading || !pools || !address) return;

    const previousPools = previousPoolsRef.current;
    const currentPools: Record<number, Pool> = {};

    pools.forEach((pool) => {
      currentPools[pool.id] = pool;
      const prevPool = previousPools[pool.id];

      if (!prevPool) {
        // New pool detected - no notification needed for initial load
        return;
      }

      // Detect winner announcement
      if (!prevPool.winnerWallet && pool.winnerWallet) {
        const isWinner = pool.winnerWallet.toLowerCase() === address.toLowerCase();

        if (isWinner) {
          // User won!
          addNotification({
            type: NotificationType.WIN,
            title: '🎉 VICTORY!',
            message: `You won ${pool.currentPot} ${pool.tokenSymbol}!`,
            poolId: pool.id,
            poolName: `${pool.tokenName} Pool`,
          });
        } else {
          // Check if user was a participant
          const isParticipant = pool.participants?.some(
            (p) => p.wallet.toLowerCase() === address.toLowerCase()
          );

          if (isParticipant) {
            // User lost
            addNotification({
              type: NotificationType.WIN, // Still use WIN sound but different message
              title: 'Pool Resolved',
              message: `Winner selected in ${pool.tokenName} pool. Better luck next time!`,
              poolId: pool.id,
              poolName: `${pool.tokenName} Pool`,
            });
          }
        }
      }

      // Detect new participant joining
      if (
        pool.currentParticipants > prevPool.currentParticipants &&
        pool.creatorWallet.toLowerCase() === address.toLowerCase()
      ) {
        addNotification({
          type: NotificationType.JOIN,
          title: 'New Participant',
          message: `Someone joined your ${pool.tokenName} pool! (${pool.currentParticipants}/${pool.maxParticipants})`,
          poolId: pool.id,
          poolName: `${pool.tokenName} Pool`,
        });
      }

      // Detect pool cancellation
      if (prevPool.status !== 'cancelled' && pool.status === 'cancelled') {
        const isCreator = pool.creatorWallet.toLowerCase() === address.toLowerCase();
        const isParticipant = pool.participants?.some(
          (p) => p.wallet.toLowerCase() === address.toLowerCase()
        );

        if (isCreator || isParticipant) {
          addNotification({
            type: NotificationType.CANCEL,
            title: 'Pool Cancelled',
            message: isCreator
              ? `Your ${pool.tokenName} pool was cancelled`
              : `${pool.tokenName} pool was cancelled by creator`,
            poolId: pool.id,
            poolName: `${pool.tokenName} Pool`,
          });
        }
      }

      // Detect pool locking
      if (prevPool.status === 'open' && pool.status === 'locked') {
        const isCreator = pool.creatorWallet.toLowerCase() === address.toLowerCase();
        const isParticipant = pool.participants?.some(
          (p) => p.wallet.toLowerCase() === address.toLowerCase()
        );

        if (isCreator || isParticipant) {
          addNotification({
            type: NotificationType.LOCKED,
            title: 'Pool Locked',
            message: `${pool.tokenName} pool is now locked. Waiting for unlock...`,
            poolId: pool.id,
            poolName: `${pool.tokenName} Pool`,
          });
        }
      }

      // Detect pool unlocking (ready for winner selection)
      if (prevPool.status === 'locked' && pool.status === 'unlocked') {
        const isCreator = pool.creatorWallet.toLowerCase() === address.toLowerCase();
        const isParticipant = pool.participants?.some(
          (p) => p.wallet.toLowerCase() === address.toLowerCase()
        );

        if (isCreator || isParticipant) {
          addNotification({
            type: NotificationType.UNLOCKED,
            title: 'Pool Unlocked',
            message: `${pool.tokenName} pool is ready for winner selection!`,
            poolId: pool.id,
            poolName: `${pool.tokenName} Pool`,
          });
        }
      }
    });

    // Update reference for next check
    previousPoolsRef.current = currentPools;
  }, [pools, isLoading, address, addNotification]);
}

/**
 * Helper function to manually trigger a notification
 * Use this for one-off events like creating a pool, joining, etc.
 */
export function useManualNotification() {
  const { addNotification } = useNotifications();

  const notifyPoolCreated = (pool: Pool) => {
    addNotification({
      type: NotificationType.JOIN,
      title: 'Pool Created!',
      message: `Your ${pool.tokenName} pool is now live`,
      poolId: pool.id,
      poolName: `${pool.tokenName} Pool`,
    });
  };

  const notifyJoinSuccess = (pool: Pool) => {
    addNotification({
      type: NotificationType.JOIN,
      title: 'Joined Pool!',
      message: `You joined the ${pool.tokenName} pool`,
      poolId: pool.id,
      poolName: `${pool.tokenName} Pool`,
    });
  };

  return {
    notifyPoolCreated,
    notifyJoinSuccess,
  };
}
