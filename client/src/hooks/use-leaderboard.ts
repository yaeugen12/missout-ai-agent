import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

// GET /api/leaderboard
export function useLeaderboard() {
  return useQuery({
    queryKey: [api.leaderboard.get.path],
    queryFn: async () => {
      const res = await fetch(api.leaderboard.get.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return api.leaderboard.get.responses[200].parse(await res.json());
    },
  });
}
