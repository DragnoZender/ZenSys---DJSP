import React, { useState } from 'react';
import { Job } from '../types/job';
import { StatusBadge } from './StatusBadge';
import { 
  X, 
  Copy, 
  Check, 
  Clock, 
  Play, 
  Pause, 
  Edit3, 
  Trash2, 
  Zap, 
  Code, 
  Tag, 
  Server
} from 'lucide-react';
import cronstrue from 'cronstrue';

interface JobDetailDrawerProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (job: Job) => void;
  onTogglePause: (job: Job) => void;
  onDelete: (job: Job) => void;
  onTriggerNow: (job: Job) => void;
}

export const JobDetailDrawer: React.FC<JobDetailDrawerProps> = ({
  job,
  isOpen,
  onClose,
  onEdit,
  onTogglePause,
  onDelete,
  onTriggerNow,
}) => {
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  if (!isOpen || !job) return null;

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(job.payload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(job.jobId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  let humanizedCron = '';
  if (job.cronExpression) {
    try {
      humanizedCron = cronstrue.toString(job.cronExpression, { throwExceptionOnParseError: false });
    } catch {
      humanizedCron = 'Custom Cron Schedule';
    }
  }

  // Prettify payload if possible
  let formattedPayload = job.payload;
  try {
    formattedPayload = JSON.stringify(JSON.parse(job.payload), null, 2);
  } catch {
    // Keep as is
  }

  let formattedMeta = job.meta || '';
  try {
    if (job.meta) {
      formattedMeta = JSON.stringify(JSON.parse(job.meta), null, 2);
    }
  } catch {
    // Keep as is
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-slate-900 border-l border-slate-700/80 h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <StatusBadge status={job.status} />
                <span className="text-xs font-mono-code text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/50">
                  {job.scheduleType}
                </span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight leading-snug">
                {job.name}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono-code text-slate-400">
                  ID: {job.jobId}
                </span>
                <button
                  onClick={handleCopyId}
                  className="text-slate-500 hover:text-brand-300 p-0.5 transition-colors"
                  title="Copy Job ID"
                >
                  {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Actions Bar */}
          <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-800/80">
            <button
              onClick={() => onTriggerNow(job)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md shadow-brand-600/20 transition-all"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>Trigger Run Now</span>
            </button>

            <button
              onClick={() => onTogglePause(job)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
            >
              {job.status === 'PAUSED' ? (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Pause</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                onClose();
                onEdit(job);
              }}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all"
              title="Edit Job"
            >
              <Edit3 className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                onClose();
                onDelete(job);
              }}
              className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all"
              title="Delete Job"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Details */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Schedule Configuration Card */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-brand-400" />
              <span>Schedule Details</span>
            </h3>

            {job.scheduleType === 'CRON' && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-slate-400">Cron Expression:</span>
                  <code className="text-xs font-mono-code text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                    {job.cronExpression}
                  </code>
                </div>
                {humanizedCron && (
                  <p className="text-xs text-slate-300 italic">
                    Runs: &ldquo;{humanizedCron}&rdquo;
                  </p>
                )}
              </div>
            )}

            {job.scheduleType === 'ONCE' && (
              <div>
                <span className="text-xs text-slate-400">Execution Target Time:</span>
                <p className="text-sm font-mono-code text-slate-200 mt-0.5">
                  {job.scheduleTime ? new Date(job.scheduleTime).toUTCString() : 'Immediate'}
                </p>
              </div>
            )}

            {job.scheduleType === 'INTERVAL' && (
              <div>
                <span className="text-xs text-slate-400">Interval Specification:</span>
                <p className="text-sm font-mono-code text-slate-200 mt-0.5">
                  {job.cronExpression || 'Recurring'}
                </p>
              </div>
            )}
          </div>

          {/* Timestamps Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] font-medium text-slate-400 block mb-1">
                Next Scheduled Run
              </span>
              <span className="text-xs font-mono-code text-emerald-400">
                {job.nextRunTime ? new Date(job.nextRunTime).toLocaleString() : '--'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] font-medium text-slate-400 block mb-1">
                Last Polled Time
              </span>
              <span className="text-xs font-mono-code text-slate-300">
                {job.lastPolledTime ? new Date(job.lastPolledTime).toLocaleString() : 'Not polled yet'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] font-medium text-slate-400 block mb-1">
                Retry Allowance
              </span>
              <span className="text-xs font-mono-code text-amber-400">
                {job.retries} Maximum Retries
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] font-medium text-slate-400 block mb-1">
                Routing Target
              </span>
              <span className="text-xs font-mono-code text-indigo-400 flex items-center gap-1">
                <Server className="w-3 h-3" /> job-service:8080
              </span>
            </div>
          </div>

          {/* Execution Payload Code Viewer */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Code className="w-3.5 h-3.5 text-brand-400" />
                <span>Job Arguments / Payload</span>
              </label>
              <button
                onClick={handleCopyPayload}
                className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                {copiedPayload ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono-code text-indigo-200 overflow-x-auto max-h-56 leading-relaxed">
              {formattedPayload}
            </pre>
          </div>

          {/* Metadata & Tags */}
          {formattedMeta && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-2">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                <span>Metadata Tags</span>
              </label>
              <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono-code text-slate-300 overflow-x-auto leading-relaxed">
                {formattedMeta}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
