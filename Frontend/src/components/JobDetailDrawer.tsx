import React, { useState, useEffect } from 'react';
import { Job, JobRun } from '../types/job';
import { StatusBadge, JobRunStatusBadge } from './StatusBadge';
import { apiService } from '../services/api';
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
  Server,
  AlertCircle
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
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [selectedRunError, setSelectedRunError] = useState<JobRun | null>(null);

  // Fetch runs for the job
  useEffect(() => {
    if (job && isOpen) {
      setIsLoadingRuns(true);
      apiService.getJobRuns(job.jobId)
        .then((res) => setRuns(res.runs))
        .catch((err) => console.warn('Could not load runs:', err))
        .finally(() => setIsLoadingRuns(false));
    }
  }, [job, isOpen]);

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

  const formatDuration = (ms: number | null) => {
    if (ms === null || ms === undefined) return '--';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(0);
    return `${mins}m ${secs}s`;
  };

  let humanizedCron = '';
  if (job.cronExpression) {
    try {
      humanizedCron = cronstrue.toString(job.cronExpression, { throwExceptionOnParseError: false });
    } catch {
      humanizedCron = 'Custom Cron Schedule';
    }
  }

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
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-panel-surface border-l border-panel-border h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-panel-border bg-panel-bg/70">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <StatusBadge status={job.status} />
                <span className="text-[11px] font-mono-code text-slate-300 bg-panel-subtle px-2 py-0.5 rounded border border-panel-border">
                  {job.scheduleType}
                </span>
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight leading-snug">
                {job.name}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono-code text-slate-400">
                  {job.jobId}
                </span>
                <button
                  onClick={handleCopyId}
                  className="text-slate-400 hover:text-white p-0.5 transition-colors"
                  title="Copy Job ID"
                >
                  {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-panel-subtle transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Actions Bar */}
          <div className="flex items-center gap-2 mt-4 pt-3.5 border-t border-panel-border">
            <button
              onClick={() => onTriggerNow(job)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-hostinger-600 hover:bg-hostinger-700 text-white text-xs font-medium transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Trigger Run Now</span>
            </button>

            <button
              onClick={() => onTogglePause(job)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel-subtle hover:bg-panel-border text-slate-200 text-xs font-medium border border-panel-border transition-colors"
            >
              {job.status === 'PAUSED' ? (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pause</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                onClose();
                onEdit(job);
              }}
              className="p-1.5 rounded-lg bg-panel-subtle hover:bg-panel-border text-slate-300 hover:text-white border border-panel-border transition-colors"
              title="Edit Job"
            >
              <Edit3 className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                onClose();
                onDelete(job);
              }}
              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
              title="Delete Job"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* View Tab Selector: Overview vs Execution History */}
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                activeTab === 'overview'
                  ? 'bg-hostinger-600 text-white border-hostinger-600'
                  : 'bg-panel-bg text-slate-400 border-panel-border hover:text-white'
              }`}
            >
              Job Overview & Payload
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                activeTab === 'history'
                  ? 'bg-hostinger-600 text-white border-hostinger-600'
                  : 'bg-panel-bg text-slate-400 border-panel-border hover:text-white'
              }`}
            >
              <span>Execution History</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-panel-subtle font-mono-code text-slate-300 border border-panel-border">
                {runs.length}
              </span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {activeTab === 'overview' ? (
            <>
              {/* Schedule Configuration */}
              <div className="p-3.5 rounded-lg bg-panel-bg border border-panel-border space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-hostinger-400" />
                  <span>Schedule Configuration</span>
                </h3>

                {job.scheduleType === 'CRON' && (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-slate-400">Cron:</span>
                      <code className="text-xs font-mono-code text-slate-200 bg-panel-subtle px-2 py-0.5 rounded border border-panel-border">
                        {job.cronExpression}
                      </code>
                    </div>
                    {humanizedCron && (
                      <p className="text-xs text-slate-300">
                        &ldquo;{humanizedCron}&rdquo;
                      </p>
                    )}
                  </div>
                )}

                {job.scheduleType === 'ONCE' && (
                  <div>
                    <span className="text-xs text-slate-400">Target Time:</span>
                    <p className="text-xs font-mono-code text-slate-200 mt-0.5">
                      {job.scheduleTime ? new Date(job.scheduleTime).toUTCString() : 'Immediate'}
                    </p>
                  </div>
                )}

                {job.scheduleType === 'INTERVAL' && (
                  <div>
                    <span className="text-xs text-slate-400">Interval Specification:</span>
                    <p className="text-xs font-mono-code text-slate-200 mt-0.5">
                      {job.cronExpression || 'Recurring'}
                    </p>
                  </div>
                )}
              </div>

              {/* Timestamps & Routing */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-lg bg-panel-bg border border-panel-border">
                  <span className="text-[11px] text-slate-400 block mb-0.5">Next Run Time</span>
                  <span className="text-xs font-mono-code text-slate-200">
                    {job.nextRunTime ? new Date(job.nextRunTime).toLocaleString() : '--'}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-panel-bg border border-panel-border">
                  <span className="text-[11px] text-slate-400 block mb-0.5">Last Polled</span>
                  <span className="text-xs font-mono-code text-slate-200">
                    {job.lastPolledTime ? new Date(job.lastPolledTime).toLocaleString() : 'Never'}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-panel-bg border border-panel-border">
                  <span className="text-[11px] text-slate-400 block mb-0.5">Retry Allowance</span>
                  <span className="text-xs font-mono-code text-slate-200">
                    {job.retries} Max Retries
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-panel-bg border border-panel-border">
                  <span className="text-[11px] text-slate-400 block mb-0.5">Gateway Service</span>
                  <span className="text-xs font-mono-code text-slate-200 flex items-center gap-1">
                    <Server className="w-3 h-3 text-slate-400" /> job-service:8080
                  </span>
                </div>
              </div>

              {/* Payload Viewer */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Code className="w-3.5 h-3.5 text-hostinger-400" />
                    <span>Payload</span>
                  </label>
                  <button
                    onClick={handleCopyPayload}
                    className="flex items-center gap-1 text-xs text-hostinger-400 hover:text-hostinger-300 transition-colors"
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
                <pre className="p-3 rounded-lg bg-panel-bg border border-panel-border text-xs font-mono-code text-slate-200 overflow-x-auto max-h-52 leading-relaxed">
                  {formattedPayload}
                </pre>
              </div>

              {/* Metadata */}
              {formattedMeta && (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-1.5">
                    <Tag className="w-3.5 h-3.5 text-slate-400" />
                    <span>Metadata</span>
                  </label>
                  <pre className="p-3 rounded-lg bg-panel-bg border border-panel-border text-xs font-mono-code text-slate-300 overflow-x-auto leading-relaxed">
                    {formattedMeta}
                  </pre>
                </div>
              )}
            </>
          ) : (
            /* Execution History Tab */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Past Runs (`GET /jobs/{job.jobId}/runs`)
                </span>
                <span className="text-[11px] text-slate-500">
                  Ordered newest to oldest
                </span>
              </div>

              {isLoadingRuns ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Loading execution runs...
                </div>
              ) : runs.length === 0 ? (
                <div className="p-8 text-center text-slate-500 rounded-lg border border-panel-border bg-panel-bg">
                  <p className="text-xs font-medium text-slate-300">No execution runs recorded yet</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Use &ldquo;Trigger Run Now&rdquo; to dispatch a run.</p>
                </div>
              ) : (
                <div className="rounded-lg border border-panel-border bg-panel-bg overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-panel-border bg-panel-subtle/50 text-[10px] uppercase font-semibold text-slate-400">
                        <th className="py-2.5 px-3">Run ID</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-center">Attempt</th>
                        <th className="py-2.5 px-3">Duration</th>
                        <th className="py-2.5 px-3">Start Time</th>
                        <th className="py-2.5 px-3 text-right">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-panel-border font-mono-code text-[11px]">
                      {runs.map((r) => (
                        <tr key={r.runId} className="hover:bg-panel-subtle/40 transition-colors">
                          <td className="py-2 px-3 text-slate-300 truncate max-w-[100px]" title={r.runId}>
                            {r.runId.substring(0, 10)}...
                          </td>
                          <td className="py-2 px-3 font-sans">
                            <JobRunStatusBadge status={r.status} size="sm" />
                          </td>
                          <td className="py-2 px-3 text-center text-slate-400">
                            #{r.attemptNumber}
                          </td>
                          <td className="py-2 px-3 text-slate-300">
                            {formatDuration(r.executionTimeMs)}
                          </td>
                          <td className="py-2 px-3 text-slate-400 font-sans text-[11px]">
                            {r.startTime ? new Date(r.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                          </td>
                          <td className="py-2 px-3 text-right font-sans">
                            {r.errorMsg ? (
                              <button
                                onClick={() => setSelectedRunError(r)}
                                className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 transition-colors"
                              >
                                View Error
                              </button>
                            ) : (
                              <button
                                onClick={() => setSelectedRunError(r)}
                                className="px-2 py-0.5 rounded text-[10px] font-medium text-slate-400 hover:text-white bg-panel-subtle border border-panel-border transition-colors"
                              >
                                View Log
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stack Trace / Error Modal */}
      {selectedRunError && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-black/80 flex items-center justify-center p-3 animate-in fade-in duration-100">
          <div className="relative w-full max-w-lg bg-panel-surface border border-panel-border rounded-xl shadow-2xl p-5 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-panel-border mb-3">
              <div className="flex items-center gap-2">
                <JobRunStatusBadge status={selectedRunError.status} />
                <span className="font-mono-code font-bold text-white text-xs">
                  Run Diagnostics
                </span>
              </div>
              <button
                onClick={() => setSelectedRunError(null)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 font-mono-code text-[11px]">
              <div className="grid grid-cols-2 gap-2 text-slate-400 bg-panel-bg p-2.5 rounded border border-panel-border">
                <div>Run ID: <span className="text-slate-200">{selectedRunError.runId}</span></div>
                <div>Attempt: <span className="text-slate-200">#{selectedRunError.attemptNumber}</span></div>
                <div>Duration: <span className="text-slate-200">{formatDuration(selectedRunError.executionTimeMs)}</span></div>
                <div>Executor: <span className="text-slate-200 truncate">{selectedRunError.executorId || '--'}</span></div>
              </div>

              {selectedRunError.errorMsg ? (
                <div>
                  <span className="text-rose-400 font-semibold flex items-center gap-1 mb-1 font-sans">
                    <AlertCircle className="w-3.5 h-3.5" /> Error Log / Stack Trace:
                  </span>
                  <pre className="p-3 rounded bg-panel-bg border border-rose-500/30 text-rose-300 text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-60">
                    {selectedRunError.errorMsg}
                  </pre>
                </div>
              ) : (
                <div className="p-3 rounded bg-panel-bg border border-panel-border text-center text-slate-400 font-sans">
                  No error reported for this run. Exit code was 0.
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-panel-border mt-3 flex justify-end">
              <button
                onClick={() => setSelectedRunError(null)}
                className="px-3 py-1.5 rounded bg-panel-subtle text-slate-200 hover:text-white border border-panel-border font-sans text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
