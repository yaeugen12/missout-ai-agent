import { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/hooks/use-wallet';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { io, Socket } from 'socket.io-client';
import { apiFetch } from '@/lib/api';
import { useProfile } from '@/hooks/use-profile';

interface ChatMessage {
  id: number;
  poolId: number;
  walletAddress: string;
  message: string;
  createdAt: string;
}

interface UserProfile {
  walletAddress: string;
  nickname: string | null;
  displayName: string;
}

interface PoolChatProps {
  poolId: number;
  poolStatus: string;
}

export function PoolChat({ poolId, poolStatus }: PoolChatProps) {
  const { address } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [userProfiles, setUserProfiles] = useState<Map<string, UserProfile>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatDisabled = poolStatus === 'ended' || poolStatus === 'cancelled';

  // Initialize WebSocket connection
  useEffect(() => {
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';
    console.log('[CHAT] Connecting to WebSocket at:', BACKEND_URL);
    const socketInstance = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
    });

    socketInstance.on('connect', () => {
      console.log('[CHAT] Connected to WebSocket');
      socketInstance.emit('join-pool-chat', poolId);
    });

    socketInstance.on('chat-message', (message: ChatMessage) => {
      console.log('[CHAT] Received message:', message);
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      socketInstance.emit('leave-pool-chat', poolId);
      socketInstance.disconnect();
    };
  }, [poolId]);

  // Load chat history
  useEffect(() => {
    loadMessages();
  }, [poolId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch user profiles for chat participants
  const fetchProfiles = async () => {
    const uniqueWallets = Array.from(new Set(messages.map(m => m.walletAddress)));
    const newProfiles = new Map<string, UserProfile>();

    // Fetch all profiles (including updates to existing ones)
    for (const wallet of uniqueWallets) {
      try {
        // Add cache busting to force fresh data
        const res = await apiFetch(`/api/profile/${wallet}?_t=${Date.now()}`);
        if (res.ok) {
          const profile = await res.json();
          newProfiles.set(wallet, profile);
          console.log(`[CHAT] Fetched profile for ${wallet.slice(0, 8)}:`, profile.nickname || 'no nickname');
        }
      } catch (err) {
        console.error(`[CHAT] Failed to fetch profile for ${wallet}:`, err);
        // Keep old profile if fetch fails
        const oldProfile = userProfiles.get(wallet);
        if (oldProfile) {
          newProfiles.set(wallet, oldProfile);
        }
      }
    }

    setUserProfiles(newProfiles);
  };

  useEffect(() => {
    if (messages.length > 0) {
      fetchProfiles();
    }
  }, [messages]);

  // Refresh profiles when chat is opened
  useEffect(() => {
    if (isOpen && messages.length > 0) {
      fetchProfiles();
    }
  }, [isOpen]);

  const loadMessages = async () => {
    try {
      const res = await apiFetch(`/api/pools/${poolId}/chat?limit=50`);
      const data = await res.json();
      // Backend returns messages in DESC order (newest first), reverse to show oldest first
      const messagesInOrder = [...data.messages].reverse();
      console.log('[CHAT] Loaded messages:', messagesInOrder.length);
      setMessages(messagesInOrder);
    } catch (err) {
      console.error('[CHAT] Failed to load messages:', err);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !address || isSending) return;

    setIsSending(true);
    try {
      console.log('[CHAT] Sending message:', { poolId, address, message: newMessage.trim() });
      const res = await apiFetch(`/api/pools/${poolId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          message: newMessage.trim(),
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        console.error('[CHAT] Server error:', error);
        throw new Error(error.message || 'Failed to send message');
      }

      const data = await res.json();
      console.log('[CHAT] Message sent successfully:', data);
      setNewMessage('');
    } catch (err) {
      console.error('[CHAT] Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const shortenAddress = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  const getDisplayName = (walletAddress: string): string => {
    if (walletAddress.toLowerCase() === address.toLowerCase()) {
      return 'You';
    }
    const profile = userProfiles.get(walletAddress);
    if (profile?.nickname) {
      return profile.nickname;
    }
    return shortenAddress(walletAddress);
  };

  return (
    <div className="fixed bottom-6 left-6 z-50">
      {/* Floating Messages (when chat is closed) */}
      <AnimatePresence>
        {!isOpen && messages.slice(-3).reverse().map((msg, index) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1 - (index * 0.3), x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className={cn(
              "mb-2 max-w-xs p-3 rounded-lg backdrop-blur-md",
              "bg-black/40 border border-white/10",
              "transition-all duration-300"
            )}
            style={{ marginBottom: index === 0 ? '8px' : `${(index + 1) * 4}px` }}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-primary font-mono">
                  {getDisplayName(msg.walletAddress)}
                </p>
                <p className="text-xs text-white/90 line-clamp-2">{msg.message}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className={cn(
              "w-80 h-96 rounded-xl backdrop-blur-xl",
              "bg-black/60 border border-white/20",
              "shadow-2xl shadow-primary/20",
              "flex flex-col overflow-hidden"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/10 bg-black/40">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-wider">Pool Chat</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-white/10"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-center">
                  <div className="text-muted-foreground">
                    <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">No messages yet</p>
                    <p className="text-[10px] mt-1">Be the first to say something!</p>
                  </div>
                </div>
              ) : (
                messages.map((msg) => {
                  const isOwnMessage = msg.walletAddress.toLowerCase() === address.toLowerCase();
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex flex-col gap-1",
                        isOwnMessage ? "items-end" : "items-start"
                      )}
                    >
                      <span className="text-[9px] text-muted-foreground font-mono px-1">
                        {getDisplayName(msg.walletAddress)}
                      </span>
                      <div
                        className={cn(
                          "max-w-[80%] p-2 rounded-lg text-xs break-words",
                          isOwnMessage
                            ? "bg-primary/20 border border-primary/30 text-white"
                            : "bg-white/5 border border-white/10 text-white/90"
                        )}
                      >
                        {msg.message}
                      </div>
                    </motion.div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            {chatDisabled ? (
              <div className="p-3 border-t border-white/10 bg-black/40 text-center">
                <p className="text-xs text-muted-foreground">Chat ended</p>
              </div>
            ) : !address ? (
              <div className="p-3 border-t border-white/10 bg-black/40 text-center">
                <p className="text-xs text-muted-foreground">Connect wallet to chat</p>
              </div>
            ) : (
              <div className="p-3 border-t border-white/10 bg-black/40">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Type a message..."
                    maxLength={500}
                    className={cn(
                      "flex-1 px-3 py-2 text-xs rounded-lg",
                      "bg-white/5 border border-white/10",
                      "text-white placeholder:text-muted-foreground",
                      "focus:outline-none focus:ring-2 focus:ring-primary/50",
                      "transition-all"
                    )}
                    disabled={isSending}
                  />
                  <Button
                    size="icon"
                    className="h-8 w-8 bg-primary/20 hover:bg-primary/30"
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || isSending}
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-[9px] text-muted-foreground mt-1 text-right">
                  {newMessage.length}/500
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "mt-2 rounded-full w-14 h-14",
            "bg-gradient-to-br from-primary/80 to-primary/60",
            "hover:from-primary hover:to-primary/80",
            "border-2 border-white/20",
            "shadow-lg shadow-primary/30",
            "transition-all duration-300"
          )}
        >
          {isOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <MessageCircle className="w-6 h-6" />
          )}
        </Button>
      </motion.div>
    </div>
  );
}
