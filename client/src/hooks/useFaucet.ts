import { useState } from "react";

export function useFaucet() {
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function requestTokens(wallet: string) {
    try {
      setLoading(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/faucet/hncz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || "Faucet request failed");
        return;
      }

      setSuccessMessage(data.message || "Tokens sent!");
    } catch (err: any) {
      setErrorMessage(err.message || "Faucet error");
    } finally {
      setLoading(false);
    }
  }

  return { requestTokens, loading, successMessage, errorMessage };
}
