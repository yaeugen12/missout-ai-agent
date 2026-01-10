// Local copy of shared types to avoid build issues
// This file duplicates types from ../../../shared/ to avoid Vite build errors
import { getApiUrl } from '@/lib/api';

export interface Pool {
  id: number;
  poolAddress: string | null;
  status: string;
  tokenMint: string;
  tokenSymbol: string;
  entryAmount: string;
  currentParticipants: number;
  maxParticipants: number;
  creatorWallet: string;
  createdAt: Date | string;
  expiresAt: Date | string | null;
  winnerWallet: string | null;
  randomnessAccount: string | null;
  randomnessRequested: boolean;
  participants?: Array<{ walletAddress: string }>;
}

export interface Participant {
  id: number;
  poolId: number;
  walletAddress: string;
  joinedAt: Date | string;
  refundClaimed: number;
}

// API routes - paths will be prefixed with backend URL automatically
export const api = {
  pools: { path: '/api/pools' },
  transactions: { path: '/api/transactions' },
  leaderboard: {
    winners: { path: '/api/leaderboard/winners' },
    referrers: { path: '/api/leaderboard/referrers' },
  },
  profile: { path: '/api/profile' },
} as const;

export function buildUrl(path: string, params?: Record<string, any>): string {
  const fullPath = getApiUrl(path);
  if (!params) return fullPath;
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      query.append(key, String(value));
    }
  });
  const queryString = query.toString();
  return queryString ? `${fullPath}?${queryString}` : fullPath;
}

export interface CreatePoolRequest {
  tokenMint: string;
  entryAmount: string;
  maxParticipants: number;
  expiresIn?: number;
}

export interface JoinPoolRequest {
  wallet: string;
  txHash: string;
}

export interface DonateRequest {
  poolId: number;
  wallet: string;
  amount: string;
  txHash: string;
}
