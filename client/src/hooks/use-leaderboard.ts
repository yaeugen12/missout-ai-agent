import { useQuery } from "@tanstack/react-query";
import { api } from "@/types/shared";
import { apiFetch } from "@/lib/api";   // <-- IMPORTANT

export function useLeaderboard() {
  return useQuery({
    queryKey: [api.leaderboard.get.path],
    queryFn: async () => {
      const res = await apiFetch(api.leaderboard.get.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return api.leaderboard.get.responses[200].parse(await res.json());
    },
  });
}

export type TopWinner = {
  wallet: string;
  winsCount: number;
  totalTokensWon: number;
  totalUsdWon: number;
  totalUsdBet: number;
  biggestWinTokens: number;
  biggestWinUsd: number;
  lastWinAt: string | null;
  tokenMint: string | null;
  tokenSymbol: string | null;
};

export type TopReferrer = {
  wallet: string;
  referralsCount: number;
  totalTokensEarned: number;
  totalUsdEarned: number;
  avgRewardPerReferral?: number;
  lastReferralAt: string | null;
  tokenMint?: string | null;
  tokenSymbol?: string | null;
};

export function useTopWinners(limit: number = 20) {
  return useQuery<TopWinner[]>({
    queryKey: [api.leaderboard.winners.path, limit],
    queryFn: async () => {
      const res = await apiFetch(`${api.leaderboard.winners.path}?limit=${limit}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch top winners");
      const response = await res.json();
      return response.data || [];
    },
  });
}

export function useTopReferrers(limit: number = 20) {
  return useQuery<TopReferrer[]>({
    queryKey: [api.leaderboard.referrers.path, limit],
    queryFn: async () => {
      const res = await apiFetch(`${api.leaderboard.referrers.path}?limit=${limit}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch top referrers");
      const response = await res.json();
      return response.data || [];
    },
  });
}
