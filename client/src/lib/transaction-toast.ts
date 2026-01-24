import { toast } from "@/hooks/use-toast";
import { createElement } from "react";
import { ExternalLink, CheckCircle2, AlertCircle, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface TransactionToastProps {
  title: string;
  description: string;
  txHash?: string;
  type: "success" | "error" | "loading";
}

export function showTransactionToast({ title, description, txHash, type }: TransactionToastProps) {
  const solscanUrl = txHash ? `https://solscan.io/tx/${txHash}` : null;

  const container = createElement("div", {
    className: cn(
      "flex flex-col gap-3 p-4 rounded-xl border backdrop-blur-xl transition-all duration-500 w-full",
      type === "success" && "bg-emerald-950/20 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)]",
      type === "error" && "bg-rose-950/20 border-rose-500/30 shadow-[0_0_20px_rgba(225,29,72,0.1)]",
      type === "loading" && "bg-cyan-950/20 border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.1)]"
    )
  }, [
    createElement("div", { className: "flex items-start gap-3", key: "header" }, [
      createElement("div", { className: "mt-0.5", key: "icon-wrapper" },
        type === "loading" && createElement(Loader2, { className: "w-5 h-5 animate-spin text-cyan-400" }),
        type === "success" && createElement(Sparkles, { className: "w-5 h-5 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" }),
        type === "error" && createElement(AlertCircle, { className: "w-5 h-5 text-rose-500 animate-pulse drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]" })
      ),
      createElement("div", { className: "flex-1 space-y-1", key: "text-content" }, [
        createElement("h3", {
          className: cn(
            "font-bold text-sm tracking-wider uppercase",
            type === "success" && "text-emerald-400",
            type === "error" && "text-rose-400",
            type === "loading" && "text-cyan-400"
          ),
          key: "title"
        }, title),
        createElement("p", { 
          className: "text-xs text-slate-300 leading-relaxed font-medium",
          key: "desc"
        }, description)
      ])
    ]),
    solscanUrl && createElement("a", {
      href: solscanUrl,
      target: "_blank",
      rel: "noopener noreferrer",
      className: cn(
        "flex items-center justify-center gap-2 w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all duration-300 border mt-1",
        type === "success" && "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40",
        type === "error" && "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/40",
        type === "loading" && "bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500/40"
      ),
      key: "link"
    }, [
      createElement(ExternalLink, { className: "w-3 h-3", key: "link-icon" }),
      "View on Solscan"
    ])
  ]) as any;

  return toast({
    variant: type === "error" ? "destructive" : "default",
    className: cn(
      "p-0 bg-transparent border-0 shadow-none overflow-visible",
      type === "error" && "animate-in fade-in slide-in-from-top-4 duration-500"
    ),
    description: container,
  });
}
