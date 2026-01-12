import { X, CheckCircle2, ExternalLink } from "lucide-react";

interface AirdropSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  signature: string;
  explorerUrl: string;
}

export function AirdropSuccessModal({ isOpen, onClose, amount, signature, explorerUrl }: AirdropSuccessModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      {/* Backdrop blur */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

      {/* Modal */}
      <div
        className="relative bg-gradient-to-br from-slate-900 to-slate-800 border border-cyan-500/30 rounded-3xl shadow-2xl max-w-md w-full p-8 animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="bg-green-500/20 rounded-full p-4">
            <CheckCircle2 className="w-16 h-16 text-green-400" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-3xl font-bold text-center mb-3 bg-gradient-to-r from-cyan-400 to-green-400 bg-clip-text text-transparent">
          Airdrop Success — Welcome to Missout!
        </h2>

        {/* Subtitle */}
        <p className="text-slate-300 text-center mb-8 text-lg">
          Your HNCZ tokens have arrived. Good luck and have fun!
        </p>

        {/* Details */}
        <div className="space-y-4 mb-6">
          <div className="bg-slate-800/50 rounded-xl p-4 border border-cyan-500/20">
            <div className="text-slate-400 text-sm mb-1">Amount received</div>
            <div className="text-2xl font-bold text-cyan-400">
              {amount.toLocaleString()} HNCZ
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-xl p-4 border border-cyan-500/20">
            <div className="text-slate-400 text-sm mb-1">Transaction signature</div>
            <div className="text-xs font-mono text-slate-300 break-all">
              {signature.slice(0, 16)}...{signature.slice(-16)}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-xl py-3 px-4 font-semibold transition-all border border-cyan-500/30"
          >
            <ExternalLink className="w-4 h-4" />
            View in Explorer
          </a>
          <button
            onClick={onClose}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-3 px-4 font-semibold transition-all"
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-scaleIn {
          animation: scaleIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
