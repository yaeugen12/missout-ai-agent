import { toast } from "@/hooks/use-toast";
import { createElement, ReactNode } from "react";
import { ExternalLink, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface TransactionToastProps {
  title: string;
  description: string;
  txHash?: string;
  type: "success" | "error" | "loading";
}

export function showTransactionToast({ title, description, txHash, type }: TransactionToastProps) {
  const solscanUrl = txHash ? `https://solscan.io/tx/${txHash}` : null;

  const titleElement = createElement("div", { className: "flex items-center gap-2" },
    type === "loading" && createElement(Loader2, { className: "w-4 h-4 animate-spin text-cyan-400" }),
    type === "success" && createElement(CheckCircle2, { className: "w-4 h-4 text-green-400" }),
    type === "error" && createElement(AlertCircle, { className: "w-4 h-4 text-red-400" }),
    createElement("span", { className: "font-black tracking-tight" }, title)
  ) as any;

  const descriptionElement = createElement("div", { className: "flex flex-col gap-2" },
    createElement("p", { className: "text-xs opacity-80" }, description),
    solscanUrl && createElement("a", {
      href: solscanUrl,
      target: "_blank",
      rel: "noopener noreferrer",
      className: "flex items-center gap-1.5 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors font-mono font-bold mt-1"
    },
      "VIEW ON SOLSCAN",
      createElement(ExternalLink, { className: "w-3 h-3" })
    )
  ) as any;

  return toast({
    variant: type === "error" ? "destructive" : "default",
    title: titleElement,
    description: descriptionElement,
  });
}
