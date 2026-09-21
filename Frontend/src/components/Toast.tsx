import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none px-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-2 duration-150 ${
            t.type === 'success'
              ? 'bg-panel-surface border-emerald-500/40 text-emerald-300'
              : t.type === 'error'
              ? 'bg-panel-surface border-rose-500/50 text-rose-300'
              : 'bg-panel-surface border-hostinger-600/40 text-hostinger-300'
          }`}
        >
          <div className="shrink-0 mt-0.5">
            {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            {t.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
            {t.type === 'info' && <Info className="w-4 h-4 text-hostinger-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-white">{t.title}</h4>
            {t.message && (
              <p className={`text-[11px] mt-1 break-words leading-relaxed ${
                t.type === 'error' ? 'text-rose-200 font-mono-code' : 'text-slate-300'
              }`}>
                {t.message}
              </p>
            )}
          </div>
          <button
            onClick={() => onDismiss(t.id)}
            className="text-slate-400 hover:text-white transition-colors p-0.5 shrink-0"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
