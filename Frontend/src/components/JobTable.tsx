import React, { useState } from 'react';
import { Job, JobStatus, ScheduleType } from '../types/job';
import { StatusBadge } from './StatusBadge';
import { 
  Search, 
  Filter, 
  Copy, 
  Check, 
  MoreVertical, 
  Eye, 
  Edit3, 
  Pause, 
  Play, 
  Trash2, 
  Calendar, 
  Repeat, 
  Clock,
  RotateCcw
} from 'lucide-react';
import cronstrue from 'cronstrue';

interface JobTableProps {
  jobs: Job[];
  searchQuery: string;
  onSearchChange: (val: string) => void;
  statusFilter: JobStatus | 'ALL';
  onStatusFilterChange: (status: JobStatus | 'ALL') => void;
  typeFilter: ScheduleType | 'ALL';
  onTypeFilterChange: (type: ScheduleType | 'ALL') => void;
  onViewJob: (job: Job) => void;
  onEditJob: (job: Job) => void;
  onTogglePause: (job: Job) => void;
  onDeleteJob: (job: Job) => void;
  onCopyId: (id: string) => void;
}

export const JobTable: React.FC<JobTableProps> = ({
  jobs,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  typeFilter,
  onTypeFilterChange,
  onViewJob,
  onEditJob,
  onTogglePause,
  onDeleteJob,
  onCopyId,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null);

  const handleCopy = (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(jobId);
    setCopiedId(jobId);
    onCopyId(jobId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatScheduleDetail = (job: Job) => {
    if (job.scheduleType === 'CRON' && job.cronExpression) {
      try {
        const humanReadable = cronstrue.toString(job.cronExpression, { throwExceptionOnParseError: false });
        return {
          primary: job.cronExpression,
          secondary: humanReadable,
        };
      } catch {
        return { primary: job.cronExpression, secondary: 'Custom Cron' };
      }
    } else if (job.scheduleType === 'ONCE' && job.scheduleTime) {
      const date = new Date(job.scheduleTime);
      return {
        primary: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
        secondary: date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      };
    } else if (job.scheduleType === 'INTERVAL') {
      return {
        primary: job.cronExpression || 'Every interval',
        secondary: 'Recurring Interval',
      };
    }
    return { primary: 'Not configured', secondary: '--' };
  };

  const formatTimestamp = (isoString?: string | null) => {
    if (!isoString) return '--';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '--';
    
    // Check if within 24 hours
    const diffMs = date.getTime() - Date.now();
    const isFuture = diffMs > 0;
    const diffHours = Math.abs(Math.round(diffMs / (1000 * 60 * 60)));
    const diffMins = Math.abs(Math.round(diffMs / (1000 * 60)));

    let relative = '';
    if (diffMins < 60) {
      relative = isFuture ? `in ${diffMins}m` : `${diffMins}m ago`;
    } else if (diffHours < 24) {
      relative = isFuture ? `in ${diffHours}h` : `${diffHours}h ago`;
    } else {
      relative = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    return (
      <div className="flex flex-col">
        <span className="text-slate-200 font-mono-code text-xs">
          {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className="text-[11px] text-slate-500">{relative}</span>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-slate-800/90 glass-panel overflow-hidden">
      {/* Table Controls: Search & Filters */}
      <div className="p-4 border-b border-slate-800/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900/40">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by job name, payload, or ID..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950/70 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500/70 focus:ring-1 focus:ring-brand-500/50 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-500 hidden sm:inline">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value as JobStatus | 'ALL')}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-slate-200">All Statuses</option>
              <option value="SCHEDULED" className="bg-slate-900 text-slate-200">Scheduled</option>
              <option value="RUNNING" className="bg-slate-900 text-slate-200">Running</option>
              <option value="PAUSED" className="bg-slate-900 text-slate-200">Paused</option>
              <option value="COMPLETED" className="bg-slate-900 text-slate-200">Completed</option>
              <option value="FAILED_PERMANENTLY" className="bg-slate-900 text-rose-300">Failed (DLQ)</option>
              <option value="CANCELLED" className="bg-slate-900 text-slate-400">Cancelled</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
            <span className="text-slate-500 hidden sm:inline">Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => onTypeFilterChange(e.target.value as ScheduleType | 'ALL')}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-slate-200">All Types</option>
              <option value="CRON" className="bg-slate-900 text-slate-200">CRON</option>
              <option value="ONCE" className="bg-slate-900 text-slate-200">ONCE</option>
              <option value="INTERVAL" className="bg-slate-900 text-slate-200">INTERVAL</option>
            </select>
          </div>

          {(statusFilter !== 'ALL' || typeFilter !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                onSearchChange('');
                onStatusFilterChange('ALL');
                onTypeFilterChange('ALL');
              }}
              className="p-2 text-xs text-slate-400 hover:text-white rounded-lg bg-slate-800/60 hover:bg-slate-800 transition-colors"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-950/40 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              <th className="py-3 px-4">Job Name & ID</th>
              <th className="py-3 px-4">Schedule Type</th>
              <th className="py-3 px-4">Expression / Time</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Next Run</th>
              <th className="py-3 px-4 text-center">Retries</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 text-sm">
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Clock className="w-8 h-8 text-slate-600" />
                    <span className="font-medium text-slate-400">No jobs found matching the criteria</span>
                    <span className="text-xs text-slate-600">Try adjusting your search or active filters</span>
                  </div>
                </td>
              </tr>
            ) : (
              jobs.map((job) => {
                const schedule = formatScheduleDetail(job);
                const isMenuOpen = actionMenuOpenId === job.jobId;

                return (
                  <tr
                    key={job.jobId}
                    onClick={() => onViewJob(job)}
                    className="group hover:bg-slate-800/30 transition-colors cursor-pointer"
                  >
                    {/* Job Name & ID */}
                    <td className="py-3.5 px-4 max-w-xs sm:max-w-sm">
                      <div className="font-semibold text-slate-100 group-hover:text-brand-300 transition-colors truncate">
                        {job.name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] font-mono-code text-slate-500 truncate max-w-[140px] sm:max-w-[180px]">
                          {job.jobId}
                        </span>
                        <button
                          onClick={(e) => handleCopy(job.jobId, e)}
                          title="Copy Job ID"
                          className="p-1 text-slate-500 hover:text-brand-400 rounded transition-colors"
                        >
                          {copiedId === job.jobId ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Schedule Type */}
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-800/80 text-slate-300 border border-slate-700/60 font-mono-code">
                        {job.scheduleType === 'CRON' && <Repeat className="w-3 h-3 text-indigo-400" />}
                        {job.scheduleType === 'ONCE' && <Calendar className="w-3 h-3 text-amber-400" />}
                        {job.scheduleType === 'INTERVAL' && <Clock className="w-3 h-3 text-emerald-400" />}
                        {job.scheduleType}
                      </span>
                    </td>

                    {/* Expression / Humanized */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-mono-code text-xs text-slate-200 truncate">
                        {schedule.primary}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5" title={schedule.secondary}>
                        {schedule.secondary}
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4">
                      <StatusBadge status={job.status} />
                    </td>

                    {/* Next Run */}
                    <td className="py-3.5 px-4">
                      {formatTimestamp(job.nextRunTime)}
                    </td>

                    {/* Retries */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-mono-code bg-slate-800/60 text-slate-300 border border-slate-700/40">
                        {job.retries}
                      </span>
                    </td>

                    {/* Row Actions */}
                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="relative inline-block text-left">
                        <button
                          onClick={() => setActionMenuOpenId(isMenuOpen ? null : job.jobId)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {isMenuOpen && (
                          <>
                            {/* Backdrop to close menu */}
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setActionMenuOpenId(null)}
                            />
                            <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl bg-slate-900 border border-slate-700/80 shadow-2xl py-1 text-xs">
                              <button
                                onClick={() => {
                                  setActionMenuOpenId(null);
                                  onViewJob(job);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                                <span>View Details</span>
                              </button>

                              <button
                                onClick={() => {
                                  setActionMenuOpenId(null);
                                  onEditJob(job);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                                <span>Edit Job</span>
                              </button>

                              <button
                                onClick={() => {
                                  setActionMenuOpenId(null);
                                  onTogglePause(job);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                              >
                                {job.status === 'PAUSED' ? (
                                  <>
                                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Resume Job</span>
                                  </>
                                ) : (
                                  <>
                                    <Pause className="w-3.5 h-3.5 text-zinc-400" />
                                    <span>Pause Job</span>
                                  </>
                                )}
                              </button>

                              <div className="h-px bg-slate-800 my-1" />

                              <button
                                onClick={() => {
                                  setActionMenuOpenId(null);
                                  onDeleteJob(job);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-rose-400 hover:bg-rose-500/10 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                <span>Delete Job</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {jobs.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-800/80 text-xs text-slate-500 flex items-center justify-between bg-slate-950/20">
          <span>Showing {jobs.length} jobs</span>
          <span className="font-mono-code text-[11px]">API Gateway Ready</span>
        </div>
      )}
    </div>
  );
};
