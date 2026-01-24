import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';

import {
  Notification as AppNotification,
  NotificationType,
  NotificationSettings,
} from '@/types/notification';

import { useWallet } from '@/hooks/use-wallet';
import { notificationSoundGenerator } from '@/lib/notificationSounds';

interface NotificationContextType {
  notifications: AppNotification[];
  settings: NotificationSettings;
  addNotification: (
    notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>
  ) => void;
  addPastNotification: (notification: Partial<AppNotification> & { type: NotificationType; title: string; message: string }) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  clearAll: () => void;
  updateSettings: (settings: Partial<NotificationSettings>) => void;
  unreadCount: number;
}

const NotificationContext =
  createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { address } = useWallet();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: true,
    soundEnabled: true,
    volume: 0.7,
  });

  // Load settings from localStorage (per wallet)
  useEffect(() => {
    if (!address) return;

    const stored = localStorage.getItem(`notification-settings-${address}`);
    if (stored) {
      try {
        setSettings(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse notification settings', e);
      }
    } else {
      // Default settings for new wallet
      setSettings({
        enabled: true,
        soundEnabled: true,
        volume: 0.7,
      });
    }
  }, [address]);

  // Save settings to localStorage (per wallet)
  useEffect(() => {
    if (!address) return;
    localStorage.setItem(
      `notification-settings-${address}`,
      JSON.stringify(settings)
    );
  }, [settings, address]);

  // Load notifications from localStorage (per wallet)
  useEffect(() => {
    if (!address) return;

    const stored = localStorage.getItem(`notifications-${address}`);
    if (stored) {
      try {
        setNotifications(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse notifications', e);
      }
    }
  }, [address]);

  // Save notifications to localStorage
  useEffect(() => {
    if (!address) return;
    localStorage.setItem(
      `notifications-${address}`,
      JSON.stringify(notifications)
    );
  }, [notifications, address]);

  const playSound = useCallback(
    (type: NotificationType) => {
      if (!settings.enabled || !settings.soundEnabled) return;
      notificationSoundGenerator.playSound(type, settings.volume);
    },
    [settings.enabled, settings.soundEnabled, settings.volume]
  );

  const addNotification = useCallback(
    (
      notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>
    ) => {
      if (!settings.enabled) return;

      const now = Date.now();
      const DEDUP_WINDOW_MS = 30000; // 30 seconds deduplication window

      const newNotification: AppNotification = {
        ...notification,
        id: `${now}-${Math.random()}`,
        timestamp: now,
        read: false,
      };

      setNotifications((prev) => {
        // Check for duplicate: same type + poolId within 30 seconds
        const isDuplicate = prev.some(existing => 
          existing.type === notification.type &&
          existing.poolId === notification.poolId &&
          (now - existing.timestamp) < DEDUP_WINDOW_MS
        );

        if (isDuplicate) {
          console.log('[Notifications] Skipping duplicate real-time notification:', notification.type, notification.poolId);
          return prev;
        }

        return [newNotification, ...prev].slice(0, 50);
      });

      // Only play sound and show browser notification if not a duplicate
      // We need to check again outside setState
      const existingDuplicate = notifications.some(existing =>
        existing.type === notification.type &&
        existing.poolId === notification.poolId &&
        (now - existing.timestamp) < DEDUP_WINDOW_MS
      );

      if (!existingDuplicate) {
        playSound(notification.type);

        // Browser notification
        if (
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          new Notification(notification.title, {
            body: notification.message,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: `${notification.type}-${notification.poolId}`,
          });
        }
      }
    },
    [settings.enabled, playSound, notifications]
  );

  // Add past notification from database (already has id, timestamp, read status)
  const addPastNotification = useCallback(
    (notification: Partial<AppNotification> & { type: NotificationType; title: string; message: string }) => {
      if (!settings.enabled) return;

      const pastNotification: AppNotification = {
        type: notification.type,
        title: notification.title,
        message: notification.message,
        poolId: notification.poolId,
        poolName: notification.poolName,
        id: notification.id || `db-${Date.now()}-${Math.random()}`,
        timestamp: notification.timestamp || Date.now(),
        read: notification.read !== undefined ? notification.read : false,
      };

      setNotifications((prev) => {
        // Check if notification already exists by:
        // 1. Same database ID
        // 2. Same type + poolId (content-based deduplication)
        const existsById = prev.some(n => n.id === pastNotification.id);
        const existsByContent = prev.some(n => 
          n.type === pastNotification.type && 
          n.poolId === pastNotification.poolId &&
          n.title === pastNotification.title
        );

        if (existsById || existsByContent) {
          console.log('[Notifications] Skipping duplicate past notification:', pastNotification.type, pastNotification.poolId);
          return prev;
        }

        return [pastNotification, ...prev].slice(0, 100); // Keep more past notifications
      });

      // Don't play sound for past notifications
      // Don't show browser notification for past notifications
    },
    [settings.enabled]
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read: true } : n
      )
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true }))
    );
  }, []);

  const clearNotification = useCallback(async (id: string) => {
    // Delete from local state
    setNotifications((prev) =>
      prev.filter((n) => n.id !== id)
    );

    // Delete from database if wallet is connected
    if (address) {
      try {
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
        await fetch(`${BACKEND_URL}/api/notifications/${id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: address }),
        });
        console.log('[Notifications] Deleted notification from DB:', id);
      } catch (err) {
        console.error('[Notifications] Failed to delete from DB:', err);
      }
    }
  }, [address]);

  const clearAll = useCallback(async () => {
    // Clear local state
    setNotifications([]);

    // Delete all from database if wallet is connected
    if (address) {
      try {
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
        await fetch(`${BACKEND_URL}/api/notifications/${address}/all`, {
          method: 'DELETE',
        });
        console.log('[Notifications] Deleted all notifications from DB');
      } catch (err) {
        console.error('[Notifications] Failed to delete all from DB:', err);
      }
    }
  }, [address]);

  const updateSettings = useCallback(
    (newSettings: Partial<NotificationSettings>) => {
      setSettings((prev) => ({
        ...prev,
        ...newSettings,
      }));
    },
    []
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        settings,
        addNotification,
        addPastNotification,
        markAsRead,
        markAllAsRead,
        clearNotification,
        clearAll,
        updateSettings,
        unreadCount,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      'useNotifications must be used within NotificationProvider'
    );
  }
  return context;
}

// Request browser notification permission
export function requestNotificationPermission() {
  if (
    'Notification' in window &&
    Notification.permission === 'default'
  ) {
    Notification.requestPermission();
  }
}
