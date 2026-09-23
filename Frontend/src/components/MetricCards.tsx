import React from 'react';
import { Job, JobStatus, JobRun, JobRunStatus } from '../types/job';
import { Layers, Activity, Clock, AlertTriangle, PauseCircle, CheckCircle2 } from 'lucide-react';

interface MetricCardsProps {
  activeTab: 'jobs' | 'runs';
  jobs: Job[];
  runs: JobRun[];
  activeJobStatusFilter: JobStatus | 'ALL';
  onSelectJobFilter: (status: JobStatus | 'ALL') => void;
  activeRunStatusFilter: JobRunStatus | 'ALL';
  onSelectRunFilter: (status: JobRunStatus | 'ALL') => void;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ 
  activeTab,
  jobs, 
  runs,
  activeJobStatusFilter, 
  onSelectJobFilter,
  activeRunStatusFilter,
  onSelectRunFilter,
}) => {
  if (activeTab === 'runs') {
    const totalRuns = runs.length;
    const runningRuns = runs.filter((r) => r.status === 'RUNNING').length;
    const successRuns = runs.filter((r) => r.status === 'SUCCESS').length;
    const failedRuns = runs.filter(
      (r) => r.status === 'FAILED' || r.status === 'TIMEOUT' || r.status === 'EXECUTOR_DIED'
    ).length;
    const queuedRuns = runs.filter((r) => r.status === 'QUEUED' || r.status === 'PENDING').length;

    const runCards = [
      {
        id: 'ALL' as const,
        label: 'Total Runs',
        count: totalRuns,
        subtext: 'Across all pipelines',
        icon: Layers,
        iconColor: 'text-slate-400',
      },
      {
        id: 'RUNNING' as const,
        label: 'Active / Running',
        count: runningRuns,
        subtext: 'Executing on worker pods',
        icon: Activity,
        iconColor: 'text-blue-400',
        badge: runningRuns > 0 ? 'Live' : undefined,
        badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      },
      {
        id: 'SUCCESS' as const,
        label: 'Successful Runs',
        count: successRuns,
        subtext: 'Exit code 0 (completed)',
        icon: CheckCircle2,
        iconColor: 'text-emerald-400',
      },
      {
        id: 'FAILED' as const,
        label: 'Failed & Errored',
        count: failedRuns,
        subtext: 'Failures, timeouts & OOMs',
        icon: AlertTriangle,
        iconColor: 'text-rose-400',
        badge: failedRuns > 0 ? 'Alert' : undefined,
        badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      },
      {
        id: 'QUEUED' as const,
        label: 'Queued / Pending',
        count: queuedRuns,
        subtext: 'Awaiting worker pod lease',
        icon: Clock,
        iconColor: 'text-amber-400',
      },
    ];

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6 animate-in fade-in duration-150">
        {runCards.map((card) => {
          const Icon = card.icon;
          const isSelected = activeRunStatusFilter === card.id;

          return (
            <button
              key={card.id}
              onClick={() => onSelectRunFilter(card.id)}
              className={`text-left p-3.5 rounded-xl border transition-colors relative cursor-pointer ${
                isSelected 
                  ? 'bg-panel-subtle border-hostinger-600/70 shadow-xs' 
                  : 'bg-panel-surface border-panel-border hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-400">
                  {card.label}
                </span>
                <Icon className={`w-4 h-4 ${card.iconColor}`} />
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold tracking-tight text-white font-mono-code">
                  {card.count}
                </span>
                {card.badge && (
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border ${card.badgeColor}`}>
                    {card.badge}
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-500 mt-1 truncate">
                {card.subtext}
              </p>
            </button>
          );
        })}
      </div>
    );
  }

  // activeTab === 'jobs'
  const totalJobs = jobs.length;
  const runningJobs = jobs.filter((j) => j.status === 'RUNNING').length;
  const scheduledJobs = jobs.filter((j) => j.status === 'SCHEDULED').length;
  const permFailedJobs = jobs.filter((j) => j.status === 'FAILED_PERMANENTLY').length;
  const failedRunsCount = runs.filter(
    (r) => r.status === 'FAILED' || r.status === 'EXECUTOR_DIED' || r.status === 'TIMEOUT'
  ).length;
  const pausedJobs = jobs.filter((j) => j.status === 'PAUSED').length;

  const jobCards = [
    {
      id: 'ALL' as const,
      label: 'Total Jobs',
      count: totalJobs,
      subtext: 'Registered pipelines',
      icon: Layers,
      iconColor: 'text-slate-400',
    },
    {
      id: 'RUNNING' as const,
      label: 'Active / Running',
      count: runningJobs,
      subtext: 'Executing now',
      icon: Activity,
      iconColor: 'text-blue-400',
      badge: runningJobs > 0 ? 'Live' : undefined,
      badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    },
    {
      id: 'SCHEDULED' as const,
      label: 'Scheduled',
      count: scheduledJobs,
      subtext: 'Awaiting trigger',
      icon: Clock,
      iconColor: 'text-slate-300',
    },
    {
      id: 'FAILED_PERMANENTLY' as const,
      label: 'Permanently Failed',
      count: permFailedJobs,
      subtext: failedRunsCount > 0 ? `${failedRunsCount} recent run failures` : 'Dead Letter Queue',
      icon: AlertTriangle,
      iconColor: 'text-rose-400',
      badge: permFailedJobs > 0 ? 'Alert' : undefined,
      badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    },
    {
      id: 'PAUSED' as const,
      label: 'Paused Jobs',
      count: pausedJobs,
      subtext: 'Suspended by user',
      icon: PauseCircle,
      iconColor: 'text-amber-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6 animate-in fade-in duration-150">
      {jobCards.map((card) => {
        const Icon = card.icon;
        const isSelected = activeJobStatusFilter === card.id;

        return (
          <button
            key={card.id}
            onClick={() => onSelectJobFilter(card.id)}
            className={`text-left p-3.5 rounded-xl border transition-colors relative cursor-pointer ${
              isSelected 
                ? 'bg-panel-subtle border-hostinger-600/70 shadow-xs' 
                : 'bg-panel-surface border-panel-border hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">
                {card.label}
              </span>
              <Icon className={`w-4 h-4 ${card.iconColor}`} />
            </div>

            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold tracking-tight text-white font-mono-code">
                {card.count}
              </span>
              {card.badge && (
                <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border ${card.badgeColor}`}>
                  {card.badge}
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-500 mt-1 truncate">
              {card.subtext}
            </p>
          </button>
        );
      })}
    </div>
  );
};
