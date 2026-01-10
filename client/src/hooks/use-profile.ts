import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { useToast } from "./use-toast";
import bs58 from "bs58";

export interface ProfileData {
  walletAddress: string;
  nickname: string | null;
  avatarUrl: string | null;
  avatarStyle: string | null;
  displayName: string;
  displayAvatar: string;
}

export interface NonceResponse {
  nonce: string;
  message: string;
}

export const AVATAR_STYLES = [
  { id: "bottts", label: "Robots" },
  { id: "identicon", label: "Geometric" },
  { id: "shapes", label: "Shapes" },
  { id: "thumbs", label: "Thumbs" },
  { id: "pixel-art", label: "Pixel Art" },
] as const;

export type AvatarStyle = typeof AVATAR_STYLES[number]["id"];

export function useProfile(walletAddress?: string) {
  return useQuery<ProfileData>({
    queryKey: ["profile", walletAddress],
    queryFn: async () => {
      if (!walletAddress) throw new Error("No wallet address");
      const res = await apiFetch(`/api/profile/${walletAddress}`);
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
    enabled: !!walletAddress,
    staleTime: 30000,
  });
}

export function useMyProfile() {
  const { publicKey } = useWallet();
  return useProfile(publicKey?.toBase58());
}

export function useProfileNonce() {
  const { publicKey } = useWallet();
  
  return useQuery<NonceResponse>({
    queryKey: ["profile-nonce", publicKey?.toBase58()],
    queryFn: async () => {
      if (!publicKey) throw new Error("No wallet connected");
      const res = await apiFetch(`/api/profile/${publicKey.toBase58()}/nonce`);
      if (!res.ok) throw new Error("Failed to get nonce");
      return res.json();
    },
    enabled: false,
  });
}

export function useUpdateProfile() {
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: { nickname?: string; avatarStyle?: AvatarStyle }) => {
      if (!publicKey) {
        throw new Error("Wallet not connected");
      }
      
      const wallet = publicKey.toBase58();
      
      const res = await apiFetch(`/api/profile/${wallet}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update profile");
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast({ title: "Profile updated", description: "Your changes have been saved" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Update failed", description: error.message });
    },
  });
}

export function generateDicebearUrl(seed: string, style: AvatarStyle = "bottts") {
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;
}

export function shortenWallet(wallet: string) {
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}
