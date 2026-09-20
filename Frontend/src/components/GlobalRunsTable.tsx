import React, { useState } from 'react';
import { JobRun, JobRunStatus } from '../types/job';
import { JobRunStatusBadge } from './StatusBadge';
import { Search, Filter, Copy, Check, Terminal, Clock, Server, AlertCircle, X } from 'lucide-react';

interface GlobalRunsTableProps {
  runs: JobRun[];
  statusFilter: JobRunStatus | 'ALL';
  onStatusFilterChange: (status: JobRunStatus | 'ALL') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectJob: (jobId: string) => void;
}

export const GlobalRunsTable: React.FC<GlobalRunsTableProps> = ({
  runs,
  statusFilter,
  onStatusFilterChange,
  searchQuery,
  onSearchChange,
  onSelectJob,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedRunForLog, setSelectedRunForLog] = useState<JobRun | null>(null);

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null || ms === undefined) return '--';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(0);
    return `${mins}m ${secs}s`;
  };

  const formatTimestamp = (isoString: string | null) => {
    if (!isoString) return '--';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '--';
    return (
      <div className="flex flex-col">
        <span className="text-slate-200 font-mono-code text-xs">
          {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        <span className="text-[11px] text-slate-500">
          {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      </div>
    );
  };

  const filteredRuns = runs.filter((run) => {
    if (statusFilter !== 'ALL' && run.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchRun = run.runId.toLowerCase().includes(q);
      const matchJob = run.jobId.toLowerCase().includes(q);
      const matchExec = (run.executorId || '').toLowerCase().includes(q);
      const matchErr = (run.errorMsg || '').toLowerCase().includes(q);
      return matchRun || matchJob || matchExec || matchErr;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Search & Filter Header */}
      <div className="rounded-xl border border-panel-border bg-panel-surface p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search run ID, job ID, executor, or error..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-panel-bg border border-panel-border rounded-lg text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-hostinger-600 focus:ring-1 focus:ring-hostinger-600 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        {/* Quick Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3 text-slate-500" /> Filter:
          </span>
          {(['ALL', 'FAILED', 'RUNNING', 'SUCCESS', 'TIMEOUT', 'EXECUTOR_DIED', 'QUEUED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => onStatusFilterChange(st)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium border transition-colors ${
                statusFilter === st
                  ? 'bg-hostinger-600 text-white border-hostinger-600'
                  : 'bg-panel-bg text-slate-400 border-panel-border hover:text-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Main Runs Table */}
      <div className="rounded-xl border border-panel-border bg-panel-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-panel-border bg-panel-bg/40 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                <th className="py-3 px-4">Run ID</th>
                <th className="py-3 px-4">Job Reference</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Attempt</th>
                <th className="py-3 px-4">Start Time</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Executor Pod</th>
                <th className="py-3 px-4 text-right">Logs & Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-panel-border text-sm">
              {filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <Clock className="w-7 h-7 text-slate-600" />
                      <span className="font-medium text-slate-300 text-sm">No execution runs found</span>
                      <span className="text-xs text-slate-500">Try changing status filter or clearing search</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRuns.map((run) => (
                  <tr
                    key={run.runId}
                    onClick={() => setSelectedRunForLog(run)}
                    className="hover:bg-panel-subtle/50 transition-colors cursor-pointer"
                  >
                    {/* Run ID */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono-code text-xs text-slate-200">
                          {run.runId.substring(0, 16)}...
                        </span>
                        <button
                          onClick={(e) => handleCopy(run.runId, e)}
                          title="Copy Full Run ID"
                          className="p-0.5 text-slate-500 hover:text-white transition-colors"
                        >
                          {copiedId === run.runId ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Job Reference */}
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onSelectJob(run.jobId)}
                        className="text-xs font-mono-code text-hostinger-400 hover:text-hostinger-300 hover:underline"
                        title="Jump to job details"
                      >
                        {run.jobId.substring(0, 12)}...
                      </button>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <JobRunStatusBadge status={run.status} />
                    </td>

                    {/* Attempt */}
                    <td className="py-3 px-4 text-center">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-mono-code bg-panel-subtle text-slate-300 border border-panel-border">
                        #{run.attemptNumber}
                      </span>
                    </td>

                    {/* Start Time */}
                    <td className="py-3 px-4">
                      {formatTimestamp(run.startTime)}
                    </td>

                    {/* Duration */}
                    <td className="py-3 px-4 font-mono-code text-xs text-slate-300">
                      {formatDuration(run.executionTimeMs)}
                    </td>

                    {/* Executor Pod */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-xs font-mono-code text-slate-400">
                        <Server className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate max-w-[140px]" title={run.executorId || 'Unassigned'}>
                          {run.executorId || 'unassigned'}
                        </span>
                      </div>
                    </td>

                    {/* Action / View Log */}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRunForLog(run);
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          run.errorMsg 
                            ? 'bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20'
                            : 'bg-panel-subtle text-slate-300 border-panel-border hover:text-white'
                        }`}
                      >
                        <Terminal className="w-3 h-3" />
                        <span>{run.errorMsg ? 'Inspect Error' : 'Details'}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredRuns.length > 0 && (
          <div className="px-4 py-2.5 border-t border-panel-border text-xs text-slate-400 flex items-center justify-between bg-panel-bg/30">
            <span>Showing {filteredRuns.length} runs</span>
            <span className="font-mono-code text-[11px] text-slate-400">ZenSys DJSP Execution Engine</span>
          </div>
        )}
      </div>

      {/* Run Log & Diagnostics Modal */}
      {selectedRunForLog && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl bg-panel-surface border border-panel-border rounded-xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-panel-border flex items-center justify-between bg-panel-bg/60">
              <div className="flex items-center gap-2.5">
                <JobRunStatusBadge status={selectedRunForLog.status} />
                <div>
                  <h3 className="text-sm font-bold text-white font-mono-code">
                    Run {selectedRunForLog.runId}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono-code">
                    Job ID: {selectedRunForLog.jobId}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRunForLog(null)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-panel-subtle"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg bg-panel-bg border border-panel-border font-mono-code">
                <div>
                  <span className="text-[10px] uppercase text-slate-500 block">Attempt</span>
                  <span className="text-slate-200">#{selectedRunForLog.attemptNumber}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-500 block">Duration</span>
                  <span className="text-slate-200">{formatDuration(selectedRunForLog.executionTimeMs)}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-500 block">Executor</span>
                  <span className="text-slate-200 truncate block" title={selectedRunForLog.executorId || '--'}>
                    {selectedRunForLog.executorId || '--'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-500 block">Modified</span>
                  <span className="text-slate-200 truncate block">
                    {new Date(selectedRunForLog.modificationTime).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              {/* Error Stack Trace or Success Output */}
              {selectedRunForLog.errorMsg ? (
                <div>
                  <label className="text-xs font-semibold text-rose-300 flex items-center gap-1.5 mb-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                    <span>Error Message / Stack Trace</span>
                  </label>
                  <pre className="p-3.5 rounded-lg bg-panel-bg border border-rose-500/30 text-rose-200 font-mono-code text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {selectedRunForLog.errorMsg}
                  </pre>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-panel-bg border border-panel-border text-center text-slate-400">
                  <Check className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                  <p className="text-xs text-slate-300 font-medium">Execution completed with 0 errors</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Worker returned exit code 0.</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-panel-border bg-panel-bg/40 flex items-center justify-between">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedRunForLog.errorMsg || selectedRunForLog.runId);
                }}
                className="text-xs text-slate-400 hover:text-white"
              >
                Copy to clipboard
              </button>
              <button
                onClick={() => setSelectedRunForLog(null)}
                className="px-3.5 py-1.5 rounded-md bg-panel-subtle text-slate-200 hover:text-white border border-panel-border text-xs font-medium"
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
