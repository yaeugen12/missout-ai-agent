import { Bell, BellOff, Trash2, Check, Trophy, Users, XCircle, Lock, Unlock, Volume2, VolumeX, Settings, Play, Sparkles, ExternalLink } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationType } from '@/types/notification';
import { notificationSoundGenerator } from '@/lib/notificationSounds';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { Slider } from '@/components/ui/slider';
import { useState } from 'react';

const NOTIFICATION_ICONS = {
  [NotificationType.WIN]: Trophy,
  [NotificationType.JOIN]: Users,
  [NotificationType.CANCEL]: XCircle,
  [NotificationType.LOCKED]: Lock,
  [NotificationType.UNLOCKED]: Unlock,
  [NotificationType.RANDOMNESS]: Sparkles,
};

const NOTIFICATION_COLORS = {
  [NotificationType.WIN]: 'from-yellow-500 to-amber-500',
  [NotificationType.JOIN]: 'from-green-500 to-emerald-500',
  [NotificationType.CANCEL]: 'from-red-500 to-rose-500',
  [NotificationType.LOCKED]: 'from-blue-500 to-cyan-500',
  [NotificationType.UNLOCKED]: 'from-purple-500 to-pink-500',
  [NotificationType.RANDOMNESS]: 'from-indigo-500 to-violet-500',
};

export function NotificationCenter() {
  const {
    notifications,
    settings,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAll,
    updateSettings,
    unreadCount,
  } = useNotifications();
  const [, setLocation] = useLocation();
  const [showSettings, setShowSettings] = useState(false);

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const handleNotificationClick = (notification: any) => {
    markAsRead(notification.id);
    if (notification.poolId) {
      setLocation(`/pool/${notification.poolId}`);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 hover:bg-white/10"
          data-testid="notification-button"
        >
          {settings.enabled ? (
            <Bell className="w-5 h-5" />
          ) : (
            <BellOff className="w-5 h-5 text-muted-foreground" />
          )}
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[380px] bg-black/95 border-white/10 p-0"
        data-testid="notification-dropdown"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm uppercase tracking-wider">Notifications</h3>
            {unreadCount > 0 && (
              <span className="text-[10px] font-mono text-primary">({unreadCount})</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-white/10"
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-white/10"
                onClick={markAllAsRead}
                title="Mark all as read"
              >
                <Check className="w-4 h-4" />
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-white/10 text-red-400 hover:text-red-300"
                onClick={clearAll}
                title="Clear all"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Settings Panel */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-white/10 bg-white/5"
            >
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                    Enable Notifications
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-6 px-2 text-xs',
                      settings.enabled ? 'text-green-400' : 'text-red-400'
                    )}
                    onClick={() => updateSettings({ enabled: !settings.enabled })}
                  >
                    {settings.enabled ? 'ON' : 'OFF'}
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                    Sound Effects
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
                    disabled={!settings.enabled}
                  >
                    {settings.soundEnabled ? (
                      <Volume2 className="w-4 h-4 text-primary" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>

                {settings.soundEnabled && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">
                        Volume: {Math.round(settings.volume * 100)}%
                      </span>
                      <Slider
                        value={[settings.volume * 100]}
                        onValueChange={([v]) => updateSettings({ volume: v / 100 })}
                        min={0}
                        max={100}
                        step={5}
                        className="w-full"
                        disabled={!settings.enabled || !settings.soundEnabled}
                      />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Notifications List */}
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="w-12 h-12 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                You'll be notified about pool activities
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              <AnimatePresence>
                {notifications.map((notification) => {
                  const Icon = NOTIFICATION_ICONS[notification.type];
                  const colorClass = NOTIFICATION_COLORS[notification.type];

                  return (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className={cn(
                        'group relative p-3 rounded-lg border transition-all cursor-pointer hover:bg-white/5',
                        notification.read
                          ? 'border-white/5 bg-black/20'
                          : 'border-primary/20 bg-primary/5'
                      )}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      {/* Gradient indicator */}
                      {!notification.read && (
                        <div className={cn(
                          'absolute inset-0 rounded-lg bg-gradient-to-r opacity-10',
                          colorClass
                        )} />
                      )}

                      <div className="relative flex items-start gap-3">
                        <div className={cn(
                          'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br',
                          colorClass
                        )}>
                          <Icon className="w-5 h-5 text-white" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className="text-sm font-bold text-white truncate">
                              {notification.title}
                            </h4>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {formatTime(notification.timestamp)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {notification.message}
                          </p>
                          {notification.poolName && (
                            <p className="text-[10px] text-primary mt-1 font-mono">
                              {notification.poolName}
                            </p>
                          )}
                          {notification.verifyUrl && notification.type === NotificationType.RANDOMNESS && (
                            <a
                              href={notification.verifyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-2 text-[10px] text-blue-400 hover:text-blue-300 transition-colors font-medium"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3 h-3" />
                              Verify On-Chain
                            </a>
                          )}
                        </div>

                        {/* Delete button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20 hover:text-red-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearNotification(notification.id);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
