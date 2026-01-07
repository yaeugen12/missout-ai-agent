import { z } from 'zod';
import { insertPoolSchema, pools, participants, transactions, profiles, updateProfileSchema } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  pools: {
    list: {
      method: 'GET' as const,
      path: '/api/pools',
      responses: {
        200: z.array(z.custom<typeof pools.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/pools/:id',
      responses: {
        200: z.custom<typeof pools.$inferSelect & { participants: typeof participants.$inferSelect[] }>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/pools',
      input: insertPoolSchema,
      responses: {
        201: z.custom<typeof pools.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    join: {
      method: 'POST' as const,
      path: '/api/pools/:id/join',
      input: z.object({ walletAddress: z.string(), avatar: z.string().optional() }),
      responses: {
        200: z.custom<typeof participants.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    donate: {
      method: 'POST' as const,
      path: '/api/pools/:id/donate',
      input: z.object({ walletAddress: z.string(), amount: z.coerce.number() }),
      responses: {
        200: z.custom<typeof transactions.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    triggerWinner: { // Dev/Demo route to force a winner
      method: 'POST' as const,
      path: '/api/pools/:id/trigger-winner',
      responses: {
        200: z.object({ winner: z.string(), payout: z.number() }),
        400: errorSchemas.validation,
      },
    },
  },
  leaderboard: {
    get: {
      method: 'GET' as const,
      path: '/api/leaderboard',
      responses: {
        200: z.object({
          topWinners: z.array(z.object({ wallet: z.string(), totalWon: z.number() })),
          topReferrers: z.array(z.object({ wallet: z.string(), referrals: z.number() })),
        }),
      },
    },
    winners: {
      method: 'GET' as const,
      path: '/api/leaderboard/winners',
      responses: {
        200: z.array(z.object({
          wallet: z.string(),
          winsCount: z.number(),
          totalTokensWon: z.number(),
          totalUsdWon: z.number(),
          biggestWinTokens: z.number(),
          biggestWinUsd: z.number(),
          lastWinAt: z.string().nullable(),
          tokenMint: z.string().nullable(),
          tokenSymbol: z.string().nullable(),
        })),
      },
    },
    referrers: {
      method: 'GET' as const,
      path: '/api/leaderboard/referrers',
      responses: {
        200: z.array(z.object({
          wallet: z.string(),
          referralsCount: z.number(),
          totalTokensEarned: z.number(),
          totalUsdEarned: z.number(),
          activeReferrals: z.number(),
          firstReferralAt: z.string().nullable(),
          lastReferralAt: z.string().nullable(),
        })),
      },
    },
  },
  profiles: {
    get: {
      method: 'GET' as const,
      path: '/api/profile/:wallet',
      responses: {
        200: z.object({
          walletAddress: z.string(),
          nickname: z.string().nullable(),
          avatarUrl: z.string().nullable(),
          avatarStyle: z.string().nullable(),
          displayName: z.string(),
          displayAvatar: z.string(),
        }),
      },
    },
    getNonce: {
      method: 'GET' as const,
      path: '/api/profile/:wallet/nonce',
      responses: {
        200: z.object({
          nonce: z.string(),
          message: z.string(),
        }),
      },
    },
    update: {
      method: 'POST' as const,
      path: '/api/profile/:wallet',
      input: updateProfileSchema,
      responses: {
        200: z.custom<typeof profiles.$inferSelect>(),
        400: errorSchemas.validation,
        401: z.object({ message: z.string() }),
        429: z.object({ message: z.string(), cooldownEnds: z.string().optional() }),
      },
    },
    transactions: {
      method: 'GET' as const,
      path: '/api/profile/:wallet/transactions',
      responses: {
        200: z.array(z.object({
          id: z.number(),
          poolId: z.number(),
          walletAddress: z.string(),
          type: z.string(),
          amount: z.number(),
          txHash: z.string().nullable(),
          timestamp: z.string(),
          pool: z.object({
            tokenSymbol: z.string(),
          })
        })),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
