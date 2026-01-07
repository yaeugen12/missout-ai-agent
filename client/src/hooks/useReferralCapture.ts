import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

const REFERRAL_STORAGE_KEY = "missout_referrer";

export function useReferralCapture() {
  const { connected, publicKey } = useWallet();
  const hasRegistered = useRef(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get("ref");

    if (refParam && refParam.length > 0) {
      const storedRef = localStorage.getItem(REFERRAL_STORAGE_KEY);
      if (!storedRef) {
        localStorage.setItem(REFERRAL_STORAGE_KEY, refParam);
        console.log("[Referral] Captured referrer from URL:", refParam);
      }

      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("ref");
      window.history.replaceState({}, "", newUrl.pathname + newUrl.search);
    }
  }, []);

  useEffect(() => {
    if (connected && publicKey && !hasRegistered.current) {
      const referrerWallet = localStorage.getItem(REFERRAL_STORAGE_KEY);
      const walletAddress = publicKey.toBase58();

      if (referrerWallet && referrerWallet !== walletAddress) {
        hasRegistered.current = true;

        fetch("/api/referrals/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            referredWallet: walletAddress,
            referrerWallet: referrerWallet,
            source: "link",
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              console.log("[Referral] Successfully registered referral:", data);
              localStorage.removeItem(REFERRAL_STORAGE_KEY);
            } else {
              console.log("[Referral] Registration response:", data.message);
            }
          })
          .catch((err) => {
            console.error("[Referral] Failed to register:", err);
            hasRegistered.current = false;
          });
      }
    }
  }, [connected, publicKey]);

  return {
    pendingReferrer: localStorage.getItem(REFERRAL_STORAGE_KEY),
  };
}
