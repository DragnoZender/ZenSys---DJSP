import React from 'react';
import { JobStatus, JobRunStatus } from '../types/job';
import { 
  CheckCircle2, 
  Pause, 
  Ban, 
  AlertTriangle, 
  Hourglass, 
  XCircle, 
  AlertOctagon, 
  Clock 
} from 'lucide-react';

interface JobStatusBadgeProps {
  status: JobStatus;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<JobStatusBadgeProps> = ({ status, size = 'md' }) => {
  const isSm = size === 'sm';
  const sizeClasses = isSm ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs font-medium';

  switch (status) {
    case 'SCHEDULED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border ${sizeClasses} bg-slate-800/70 text-slate-300 border-slate-700/80`}>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          SCHEDULED
        </span>
      );

    case 'RUNNING':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border ${sizeClasses} bg-blue-500/10 text-blue-400 border-blue-500/30`}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          RUNNING
        </span>
      );

    case 'COMPLETED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border ${sizeClasses} bg-emerald-500/10 text-emerald-400 border-emerald-500/30`}>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          COMPLETED
        </span>
      );

    case 'PAUSED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border ${sizeClasses} bg-amber-500/10 text-amber-400 border-amber-500/30`}>
          <Pause className="w-3.5 h-3.5 text-amber-400" />
          PAUSED
        </span>
      );

    case 'CANCELLED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border ${sizeClasses} bg-slate-800/60 text-slate-400 border-slate-700/60`}>
          <Ban className="w-3.5 h-3.5 text-slate-400" />
          CANCELLED
        </span>
      );

    case 'FAILED_PERMANENTLY':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border ${sizeClasses} bg-rose-500/15 text-rose-300 border-rose-500/40`}>
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          FAILED (DLQ)
        </span>
      );

    default:
      return (
        <span className={`inline-flex items-center rounded-md border ${sizeClasses} bg-slate-800 text-slate-300 border-slate-700`}>
          {status}
        </span>
      );
  }
};

interface JobRunStatusBadgeProps {
  status: JobRunStatus;
  size?: 'sm' | 'md';
}

export const JobRunStatusBadge: React.FC<JobRunStatusBadgeProps> = ({ status, size = 'md' }) => {
  const isSm = size === 'sm';
  const sizeClasses = isSm ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs font-medium';

  switch (status) {
    case 'PENDING':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border ${sizeClasses} bg-slate-800/70 text-slate-300 border-slate-700`}>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          PENDING
        </span>
      );

    case 'QUEUED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border ${sizeClasses} bg-indigo-500/10 text-indigo-400 border-indigo-500/30`}>
          <Hourglass className="w-3.5 h-3.5 text-indigo-400" />
          QUEUED
        </span>
      );

    case 'RUNNING':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border ${sizeClasses} bg-blue-500/10 text-blue-400 border-blue-500/30`}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          RUNNING
        </span>
      );

    case 'SUCCESS':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border ${sizeClasses} bg-emerald-500/10 text-emerald-400 border-emerald-500/30`}>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          SUCCESS
        </span>
      );

    case 'FAILED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border ${sizeClasses} bg-rose-500/10 text-rose-400 border-rose-500/30`}>
          <XCircle className="w-3.5 h-3.5 text-rose-400" />
          FAILED
        </span>
      );

    case 'TIMEOUT':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border ${sizeClasses} bg-amber-500/10 text-amber-400 border-amber-500/30`}>
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          TIMEOUT
        </span>
      );

    case 'CANCELLED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border ${sizeClasses} bg-slate-800/60 text-slate-400 border-slate-700/60`}>
          <Ban className="w-3.5 h-3.5 text-slate-400" />
          CANCELLED
        </span>
      );

    case 'EXECUTOR_DIED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border ${sizeClasses} bg-rose-500/20 text-rose-300 border-rose-500/50`}>
          <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
          EXECUTOR_DIED
        </span>
      );

    default:
      return (
        <span className={`inline-flex items-center rounded-md border ${sizeClasses} bg-slate-800 text-slate-300 border-slate-700`}>
          {status}
        </span>
      );
  }
};
