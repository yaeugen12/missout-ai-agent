// Local copy of shared types to avoid build issues
// This file duplicates types from ../../../shared/ to avoid Vite build errors
import { getApiUrl } from '@/lib/api';

export interface Pool {
  id: number;
  poolAddress: string | null;
  status: string;
  tokenMint: string;
  tokenSymbol: string;
  tokenName: string;
  entryAmount: number;
  currentParticipants: number;
  participantsCount: number;
  maxParticipants: number;
  creatorWallet: string;
  createdAt: Date | string;
  expiresAt: Date | string | null;
  winnerWallet: string | null;
  randomnessAccount: string | null;
  randomnessRequested: boolean;
  lockDuration: number;
  lockTime: string | null;
  totalPot: number;
  initialPriceUsd: number | null;
  currentPriceUsd: number | null;
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
  pools: {
    list: {
      method: 'GET' as const,
      path: '/api/pools',
    },
    get: {
      method: 'GET' as const,
      path: '/api/pools/:id',
    },
    create: {
      method: 'POST' as const,
      path: '/api/pools',
      responses: {
        201: { parse: (data: any) => data },
        400: { parse: (data: any) => data },
      },
    },
    join: {
      method: 'POST' as const,
      path: '/api/pools/:id/join',
      responses: {
        200: { parse: (data: any) => data },
        400: { parse: (data: any) => data },
        404: { parse: (data: any) => data },
      },
    },
    donate: {
      method: 'POST' as const,
      path: '/api/pools/:id/donate',
      responses: {
        200: { parse: (data: any) => data },
        404: { parse: (data: any) => data },
      },
    },
    triggerWinner: {
      method: 'POST' as const,
      path: '/api/pools/:id/trigger-winner',
      responses: {
        200: { parse: (data: any) => data },
        400: { parse: (data: any) => data },
      },
    },
  },
  transactions: {
    create: {
      method: 'POST' as const,
      path: '/api/transactions',
      responses: {
        201: { parse: (data: any) => data },
        400: { parse: (data: any) => data },
      },
    },
  },
  leaderboard: {
    get: {
      method: 'GET' as const,
      path: '/api/leaderboard',
    },
    winners: {
      method: 'GET' as const,
      path: '/api/leaderboard/winners',
    },
    referrers: {
      method: 'GET' as const,
      path: '/api/leaderboard/referrers',
    },
  },
  profiles: {
    get: {
      method: 'GET' as const,
      path: '/api/profile/:wallet',
      responses: {
        200: { parse: (data: any) => data },
      },
    },
    getNonce: {
      method: 'GET' as const,
      path: '/api/profile/:wallet/nonce',
      responses: {
        200: { parse: (data: any) => data },
      },
    },
    update: {
      method: 'POST' as const,
      path: '/api/profile/:wallet',
      responses: {
        200: { parse: (data: any) => data },
        400: { parse: (data: any) => data },
        401: { parse: (data: any) => data },
        429: { parse: (data: any) => data },
      },
    },
    transactions: {
      method: 'GET' as const,
      path: '/api/profile/:wallet/transactions',
      responses: {
        200: { parse: (data: any) => data },
      },
    },
  },
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

// Helper to build API URLs with path parameters (e.g., /api/pools/:id)
export function buildApiUrl(path: string, pathParams?: Record<string, string | number>, queryParams?: Record<string, any>): string {
  let finalPath = path;

  // Replace path parameters like :id, :wallet
  if (pathParams) {
    Object.entries(pathParams).forEach(([key, value]) => {
      finalPath = finalPath.replace(`:${key}`, String(value));
    });
  }

  return buildUrl(finalPath, queryParams);
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
