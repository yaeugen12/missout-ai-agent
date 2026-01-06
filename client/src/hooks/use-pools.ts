import type { Pool } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreatePoolRequest, type JoinPoolRequest, type DonateRequest } from "@shared/routes";

// GET /api/pools
export function usePools() {
  return useQuery({
    queryKey: ["/api/pools"],
    queryFn: async () => {
      const res = await fetch("/api/pools", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pools");
      return await res.json() as Pool[];
    },
    refetchInterval: 5000,
  });
}

// GET /api/pools/:id
export function usePool(id: number) {
  return useQuery({
    queryKey: ["/api/pools", id],
    queryFn: async () => {
      const res = await fetch(`/api/pools/${id}`, { credentials: "include" });
      if (res.status === 404) throw new Error("Pool not found");
      if (!res.ok) throw new Error("Failed to fetch pool");
      return await res.json() as Pool;
    },
    refetchInterval: 2000,
    enabled: !isNaN(id),
  });
}

// POST /api/pools
export function useCreatePool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreatePoolRequest) => {
      const res = await fetch(api.pools.create.path, {
        method: api.pools.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.pools.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create pool");
      }
      return api.pools.create.responses[201].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.pools.list.path] }),
  });
}

// POST /api/pools/:id/join
export function useJoinPool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: JoinPoolRequest & { id: number }) => {
      const url = buildUrl(api.pools.join.path, { id });
      const res = await fetch(url, {
        method: api.pools.join.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to join pool");
      return api.pools.join.responses[200].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.pools.get.path, variables.id] });
      queryClient.invalidateQueries({ queryKey: [api.pools.list.path] });
    },
  });
}

// POST /api/pools/:id/donate
export function useDonateToPool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: DonateRequest & { id: number }) => {
      const url = buildUrl(api.pools.donate.path, { id });
      const res = await fetch(url, {
        method: api.pools.donate.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to donate");
      return api.pools.donate.responses[200].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.pools.get.path, variables.id] });
    },
  });
}

// POST /api/pools/:id/trigger-winner (DEV ONLY)
export function useTriggerWinner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.pools.triggerWinner.path, { id });
      const res = await fetch(url, {
        method: api.pools.triggerWinner.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to trigger winner");
      return api.pools.triggerWinner.responses[200].parse(await res.json());
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: [api.pools.get.path, id] });
    },
  });
}
