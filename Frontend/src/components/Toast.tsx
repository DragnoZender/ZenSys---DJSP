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
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-xl backdrop-blur-md animate-in slide-in-from-bottom-2 duration-200 ${
            t.type === 'success'
              ? 'bg-slate-900/90 border-emerald-500/40 text-emerald-300'
              : t.type === 'error'
              ? 'bg-slate-900/90 border-rose-500/40 text-rose-300'
              : 'bg-slate-900/90 border-indigo-500/40 text-indigo-300'
          }`}
        >
          <div className="shrink-0 mt-0.5">
            {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            {t.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
            {t.type === 'info' && <Info className="w-4 h-4 text-indigo-400" />}
          </div>
          <div className="flex-1">
            <h4 className="text-xs font-bold text-white">{t.title}</h4>
            {t.message && <p className="text-[11px] text-slate-400 mt-0.5">{t.message}</p>}
          </div>
          <button
            onClick={() => onDismiss(t.id)}
            className="text-slate-500 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
