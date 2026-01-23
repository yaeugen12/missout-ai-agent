export enum NotificationType {
  WIN = 'win',
  JOIN = 'join',
  CANCEL = 'cancel',
  LOCKED = 'locked',
  UNLOCKED = 'unlocked',
  RANDOMNESS = 'randomness',
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  poolId?: number;
  poolName?: string;
  timestamp: number;
  read: boolean;
  verifyUrl?: string; // Link to verify randomness on-chain (for RANDOMNESS type)
}

export interface NotificationSettings {
  enabled: boolean;
  soundEnabled: boolean;
  volume: number; // 0-1
}
