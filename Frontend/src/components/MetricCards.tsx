import React from 'react';
import { Job, JobStatus, JobRun } from '../types/job';
import { Layers, Activity, Clock, AlertTriangle, PauseCircle } from 'lucide-react';

interface MetricCardsProps {
  jobs: Job[];
  runs: JobRun[];
  activeStatusFilter: JobStatus | 'ALL';
  onSelectFilter: (status: JobStatus | 'ALL') => void;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ 
  jobs, 
  runs,
  activeStatusFilter, 
  onSelectFilter 
}) => {
  const total = jobs.length;
  const running = jobs.filter((j) => j.status === 'RUNNING').length;
  const scheduled = jobs.filter((j) => j.status === 'SCHEDULED').length;
  const permFailed = jobs.filter((j) => j.status === 'FAILED_PERMANENTLY').length;
  const failedRunsCount = runs.filter((r) => r.status === 'FAILED' || r.status === 'EXECUTOR_DIED' || r.status === 'TIMEOUT').length;
  const paused = jobs.filter((j) => j.status === 'PAUSED').length;

  const cards = [
    {
      id: 'ALL' as const,
      label: 'Total Jobs',
      count: total,
      subtext: 'Registered pipelines',
      icon: Layers,
      iconColor: 'text-slate-400',
    },
    {
      id: 'RUNNING' as const,
      label: 'Active / Running',
      count: running,
      subtext: 'Executing now',
      icon: Activity,
      iconColor: 'text-blue-400',
      badge: running > 0 ? 'Live' : undefined,
      badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    },
    {
      id: 'SCHEDULED' as const,
      label: 'Scheduled',
      count: scheduled,
      subtext: 'Awaiting trigger',
      icon: Clock,
      iconColor: 'text-slate-300',
    },
    {
      id: 'FAILED_PERMANENTLY' as const,
      label: 'Permanently Failed',
      count: permFailed,
      subtext: failedRunsCount > 0 ? `${failedRunsCount} recent run failures` : 'Dead Letter Queue',
      icon: AlertTriangle,
      iconColor: 'text-rose-400',
      badge: permFailed > 0 ? 'Alert' : undefined,
      badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    },
    {
      id: 'PAUSED' as const,
      label: 'Paused Jobs',
      count: paused,
      subtext: 'Suspended by user',
      icon: PauseCircle,
      iconColor: 'text-amber-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const isSelected = activeStatusFilter === card.id;

        return (
          <button
            key={card.id}
            onClick={() => onSelectFilter(card.id)}
            className={`text-left p-3.5 rounded-xl border transition-colors relative ${
              isSelected 
                ? 'bg-panel-subtle border-hostinger-600/70' 
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
