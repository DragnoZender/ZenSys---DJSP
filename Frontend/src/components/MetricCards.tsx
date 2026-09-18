import React from 'react';
import { Job, JobStatus } from '../types/job';
import { Layers, Activity, Clock, AlertTriangle, PauseCircle } from 'lucide-react';

interface MetricCardsProps {
  jobs: Job[];
  activeStatusFilter: JobStatus | 'ALL';
  onSelectFilter: (status: JobStatus | 'ALL') => void;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ jobs, activeStatusFilter, onSelectFilter }) => {
  const total = jobs.length;
  const running = jobs.filter((j) => j.status === 'RUNNING').length;
  const scheduled = jobs.filter((j) => j.status === 'SCHEDULED').length;
  const failed = jobs.filter((j) => j.status === 'FAILED_PERMANENTLY').length;
  const paused = jobs.filter((j) => j.status === 'PAUSED').length;

  const cards = [
    {
      id: 'ALL' as const,
      label: 'Total Registered Jobs',
      count: total,
      icon: Layers,
      color: 'text-indigo-400',
      bgGlow: 'group-hover:border-indigo-500/40',
      activeBorder: activeStatusFilter === 'ALL' ? 'border-indigo-500/70 bg-indigo-500/10' : '',
    },
    {
      id: 'RUNNING' as const,
      label: 'Active / Running',
      count: running,
      icon: Activity,
      color: 'text-amber-400',
      bgGlow: 'group-hover:border-amber-500/40',
      activeBorder: activeStatusFilter === 'RUNNING' ? 'border-amber-500/70 bg-amber-500/10' : '',
      pulse: running > 0,
    },
    {
      id: 'SCHEDULED' as const,
      label: 'Scheduled Jobs',
      count: scheduled,
      icon: Clock,
      color: 'text-blue-400',
      bgGlow: 'group-hover:border-blue-500/40',
      activeBorder: activeStatusFilter === 'SCHEDULED' ? 'border-blue-500/70 bg-blue-500/10' : '',
    },
    {
      id: 'FAILED_PERMANENTLY' as const,
      label: 'Failed / Dead Letter',
      count: failed,
      icon: AlertTriangle,
      color: 'text-rose-400',
      bgGlow: 'group-hover:border-rose-500/40',
      activeBorder: activeStatusFilter === 'FAILED_PERMANENTLY' ? 'border-rose-500/70 bg-rose-500/10' : '',
      alert: failed > 0,
    },
    {
      id: 'PAUSED' as const,
      label: 'Paused Jobs',
      count: paused,
      icon: PauseCircle,
      color: 'text-zinc-400',
      bgGlow: 'group-hover:border-zinc-500/40',
      activeBorder: activeStatusFilter === 'PAUSED' ? 'border-zinc-500/70 bg-zinc-500/10' : '',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const isSelected = activeStatusFilter === card.id;

        return (
          <button
            key={card.id}
            onClick={() => onSelectFilter(card.id)}
            className={`group text-left p-4 rounded-xl border transition-all duration-200 glass-card relative overflow-hidden ${
              isSelected ? card.activeBorder : 'border-slate-800/80 hover:border-slate-700'
            } ${card.bgGlow}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400 group-hover:text-slate-200 transition-colors">
                {card.label}
              </span>
              <div className={`p-1.5 rounded-lg bg-slate-900/60 border border-slate-800/80 ${card.color}`}>
                <Icon className={`w-4 h-4 ${card.pulse ? 'animate-pulse' : ''}`} />
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-white font-mono-code">
                {card.count}
              </span>
              {isSelected && (
                <span className="text-[10px] uppercase font-semibold tracking-wider text-brand-400 ml-auto">
                  Filtered
                </span>
              )}
            </div>

            {/* Subtle bottom highlight indicator */}
            {isSelected && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-brand-500 to-transparent" />
            )}
          </button>
        );
      })}
    </div>
  );
};
