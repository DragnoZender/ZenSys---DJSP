import React, { useState, useEffect } from 'react';
import { JobRun } from '../types/job';
import { JobRunStatusBadge } from './StatusBadge';
import { apiService } from '../services/api';
import {
  X,
  Copy,
  Check,
  Server,
  AlertCircle,
  CheckCircle2,
  Code,
  FileText
} from 'lucide-react';

interface RunDetailModalProps {
  runId: string | null;
  initialRun?: JobRun | null;
  jobName?: string;
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'fields' | 'json';
}

export const RunDetailModal: React.FC<RunDetailModalProps> = ({
  runId,
  initialRun,
  jobName,
  isOpen,
  onClose,
  defaultTab = 'fields',
}) => {
  const [run, setRun] = useState<JobRun | null>(initialRun || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'fields' | 'json'>(defaultTab);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Fetch run details using GET /jobs/runs/{runId}
  useEffect(() => {
    if (isOpen && runId) {
      if (initialRun && initialRun.runId === runId) {
        setRun(initialRun);
      }
      setIsLoading(true);
      setError(null);
      apiService
        .getRunById(runId)
        .then((data) => setRun(data))
        .catch((err) => {
          console.warn('Could not fetch run details:', err);
          if (!initialRun) setError(err.message || 'Run not found');
        })
        .finally(() => setIsLoading(false));
    } else {
      setRun(null);
    }
  }, [isOpen, runId, initialRun]);

  // Escape key support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || (!run && !isLoading && !error)) return null;

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null || ms === undefined) return '--';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s (${ms}ms)`;
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(1);
    return `${mins}m ${secs}s (${ms}ms)`;
  };

  const formatTimestamp = (iso: string | null) => {
    if (!iso) return { local: '--', iso: 'null' };
    try {
      const d = new Date(iso);
      return {
        local: d.toLocaleString(),
        iso,
      };
    } catch {
      return { local: iso, iso };
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="relative w-full max-w-2xl bg-panel-surface border border-panel-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-panel-border flex items-center justify-between bg-panel-bg/85">
          <div className="flex items-center gap-3">
            {run && <JobRunStatusBadge status={run.status} />}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white font-mono-code">
                  Run Instance Details
                </h3>
              </div>
              {jobName && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Job Pipeline: <span className="text-slate-200 font-medium">{jobName}</span>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-panel-subtle transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-5 pt-3 border-b border-panel-border bg-panel-bg/40 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('fields')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t text-xs font-medium border-b-2 transition-colors cursor-pointer ${activeTab === 'fields'
                ? 'border-hostinger-500 text-white bg-panel-subtle/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
            >
              <FileText className="w-3.5 h-3.5 text-hostinger-400" />
              <span>Response Fields</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('json')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t text-xs font-medium border-b-2 transition-colors cursor-pointer ${activeTab === 'json'
                ? 'border-hostinger-500 text-white bg-panel-subtle/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
            >
              <Code className="w-3.5 h-3.5 text-hostinger-400" />
              <span>Raw JSON (`200 OK`)</span>
            </button>
          </div>

          {run && (
            <div className="flex items-center gap-2 pb-1.5">
              <span className="text-[10px] text-slate-500 font-mono-code hidden sm:inline">
                Record ID: #{run.id}
              </span>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto max-h-[62vh] space-y-4">
          {isLoading && !run && (
            <div className="py-12 text-center text-slate-400 text-xs">
              Loading run details from API...
            </div>
          )}

          {error && !run && (
            <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> 404 Run Not Found
              </div>
              <p className="text-[11px] mt-1 text-rose-200/80">{error}</p>
            </div>
          )}

          {run && activeTab === 'fields' && (
            <div className="space-y-4 font-sans">
              {/* Primary Identifier Bar */}
              <div className="p-3.5 rounded-lg bg-panel-bg border border-panel-border space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      runId
                    </span>
                    <span className="text-xs font-mono-code text-white font-semibold selection:bg-hostinger-600">
                      {run.runId}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(run.runId, 'runId')}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {copiedField === 'runId' ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedField === 'runId' ? 'Copied' : 'Copy runId'}</span>
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-panel-border/60">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      jobId
                    </span>
                    <span className="text-xs font-mono-code text-slate-300">
                      {run.jobId}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(run.jobId, 'jobId')}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {copiedField === 'jobId' ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedField === 'jobId' ? 'Copied' : 'Copy jobId'}</span>
                  </button>
                </div>
              </div>

              {/* API Properties Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* ID */}
                <div className="p-3 rounded-lg bg-panel-bg border border-panel-border">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                    id (Database PK)
                  </span>
                  <span className="text-sm font-bold text-white font-mono-code">
                    #{run.id}
                  </span>
                </div>

                {/* Status */}
                <div className="p-3 rounded-lg bg-panel-bg border border-panel-border">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                    status
                  </span>
                  <JobRunStatusBadge status={run.status} size="sm" />
                </div>

                {/* Attempt Number */}
                <div className="p-3 rounded-lg bg-panel-bg border border-panel-border">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                    attemptNumber
                  </span>
                  <span className="text-sm font-bold text-slate-200 font-mono-code">
                    #{run.attemptNumber}
                  </span>
                </div>

                {/* Execution Time */}
                <div className="p-3 rounded-lg bg-panel-bg border border-panel-border">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                    executionTimeMs
                  </span>
                  <span className="text-sm font-bold text-slate-200 font-mono-code" title={`${run.executionTimeMs} ms`}>
                    {run.executionTimeMs !== null ? `${run.executionTimeMs}ms` : '--'}
                  </span>
                  <span className="text-[10px] text-slate-500 block font-mono-code">
                    {formatDuration(run.executionTimeMs)}
                  </span>
                </div>
              </div>

              {/* Executor Pod */}
              <div className="p-3 rounded-lg bg-panel-bg border border-panel-border flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">
                    executorId (Assigned Worker Pod)
                  </span>
                  <span className="text-xs font-mono-code text-slate-200 font-medium">
                    {run.executorId || 'unassigned'}
                  </span>
                </div>
                <div className="p-2 rounded bg-panel-subtle text-slate-400 border border-panel-border">
                  <Server className="w-4 h-4 text-hostinger-400" />
                </div>
              </div>

              {/* Timestamps Section */}
              <div className="p-3.5 rounded-lg bg-panel-bg border border-panel-border space-y-2.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Execution Timestamps (ISO-8601)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono-code text-[11px]">
                  <div>
                    <span className="text-[10px] uppercase text-slate-500 block font-sans">startTime</span>
                    <span className="text-slate-200 block truncate" title={run.startTime || ''}>
                      {formatTimestamp(run.startTime).local}
                    </span>
                    <span className="text-[10px] text-slate-500 block truncate" title={run.startTime || ''}>
                      {run.startTime || 'null'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase text-slate-500 block font-sans">endTime</span>
                    <span className="text-slate-200 block truncate" title={run.endTime || ''}>
                      {run.endTime ? formatTimestamp(run.endTime).local : 'In Progress'}
                    </span>
                    <span className="text-[10px] text-slate-500 block truncate" title={run.endTime || ''}>
                      {run.endTime || 'null'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase text-slate-500 block font-sans">modificationTime</span>
                    <span className="text-slate-200 block truncate" title={run.modificationTime}>
                      {formatTimestamp(run.modificationTime).local}
                    </span>
                    <span className="text-[10px] text-slate-500 block truncate" title={run.modificationTime}>
                      {run.modificationTime}
                    </span>
                  </div>
                </div>
              </div>

              {/* errorMsg Section */}
              <div>
                {run.errorMsg ? (
                  <div className="rounded-lg border border-rose-500/35 bg-panel-bg overflow-hidden">
                    <div className="px-3.5 py-2.5 bg-rose-500/10 border-b border-rose-500/25 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-rose-300 font-semibold text-xs">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                        <span>errorMsg (Failure Stack Trace)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(run.errorMsg!, 'errorMsg')}
                        className="text-[11px] text-rose-300/80 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        {copiedField === 'errorMsg' ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedField === 'errorMsg' ? 'Copied' : 'Copy errorMsg'}</span>
                      </button>
                    </div>
                    <pre className="p-3.5 text-rose-200 font-mono-code text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap selection:bg-rose-500/30">
                      {run.errorMsg}
                    </pre>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-lg bg-panel-bg border border-panel-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <div>
                        <span className="text-xs font-medium text-slate-200">
                          errorMsg: null
                        </span>
                        <p className="text-[11px] text-slate-400">
                          Execution completed with 0 errors. Exit code was 0.
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono-code px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                      NO ERRORS
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {run && activeTab === 'json' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="font-mono-code text-[11px]">
                  HTTP 200 OK — application/json
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(JSON.stringify(run, null, 2), 'json')}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  {copiedField === 'json' ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedField === 'json' ? 'Copied JSON' : 'Copy Raw JSON'}</span>
                </button>
              </div>
              <pre className="p-4 rounded-lg bg-[#07090e] border border-panel-border font-mono-code text-[11px] text-slate-200 overflow-x-auto leading-relaxed selection:bg-hostinger-600">
                {JSON.stringify(run, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-panel-border bg-panel-bg/70 flex items-center justify-between font-sans">
          <div className="flex items-center gap-2">
            {run && (
              <button
                type="button"
                onClick={() => handleCopy(JSON.stringify(run, null, 2), 'footerJson')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-panel-subtle hover:bg-panel-border text-slate-200 hover:text-white border border-panel-border text-xs transition-colors cursor-pointer"
              >
                {copiedField === 'footerJson' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Copy JSON Response</span>
              </button>
            )}
            {run?.errorMsg && (
              <button
                type="button"
                onClick={() => handleCopy(run.errorMsg!, 'footerError')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-white border border-rose-500/30 text-xs transition-colors cursor-pointer"
              >
                {copiedField === 'footerError' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>Copy errorMsg</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-panel-subtle hover:bg-panel-border text-slate-200 hover:text-white border border-panel-border text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
