import React from 'react';
import { JobStatus } from '../types/job';
import { Clock, CheckCircle2, Pause, Ban, AlertTriangle } from 'lucide-react';

interface StatusBadgeProps {
  status: JobStatus;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const isSm = size === 'sm';
  const sizeClasses = isSm ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs tracking-wide';

  switch (status) {
    case 'RUNNING':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${sizeClasses} bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_12px_-3px_rgba(245,158,11,0.25)]`}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          RUNNING
        </span>
      );

    case 'SCHEDULED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${sizeClasses} bg-blue-500/10 text-blue-400 border-blue-500/30`}
        >
          <Clock className="w-3.5 h-3.5 text-blue-400" />
          SCHEDULED
        </span>
      );

    case 'COMPLETED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${sizeClasses} bg-emerald-500/10 text-emerald-400 border-emerald-500/30`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          COMPLETED
        </span>
      );

    case 'PAUSED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${sizeClasses} bg-zinc-500/10 text-zinc-300 border-zinc-500/30`}
        >
          <Pause className="w-3.5 h-3.5 text-zinc-400" />
          PAUSED
        </span>
      );

    case 'CANCELLED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${sizeClasses} bg-slate-500/10 text-slate-400 border-slate-500/30`}
        >
          <Ban className="w-3.5 h-3.5 text-slate-400" />
          CANCELLED
        </span>
      );

    case 'FAILED_PERMANENTLY':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${sizeClasses} bg-rose-500/10 text-rose-400 border-rose-500/30 shadow-[0_0_12px_-3px_rgba(244,63,94,0.25)]`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          FAILED (DLQ)
        </span>
      );

    default:
      return (
        <span className={`inline-flex items-center font-medium rounded-full border ${sizeClasses} bg-slate-800 text-slate-300 border-slate-700`}>
          {status}
        </span>
      );
  }
};
