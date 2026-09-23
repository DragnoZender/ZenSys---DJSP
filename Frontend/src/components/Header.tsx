import React from 'react';
import { Plus, RefreshCw, Server, Layers, Activity } from 'lucide-react';
import { SystemHealth } from '../types/job';

interface HeaderProps {
  activeTab: 'jobs' | 'runs';
  onTabChange: (tab: 'jobs' | 'runs') => void;
  health: SystemHealth;
  isRefreshing: boolean;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  onManualRefresh: () => void;
  onOpenCreateModal: () => void;
  onToggleForceMock?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  health: _health,
  isRefreshing,
  autoRefresh,
  onToggleAutoRefresh,
  onManualRefresh,
  onOpenCreateModal,
}) => {

  return (
    <header className="sticky top-0 z-30 border-b border-panel-border bg-panel-bg/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Logo & Navigation Tabs */}
        <div className="flex items-center gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-white">
                ZenSys
              </span>

            </div>
            <p className="text-[11px] text-slate-400 font-normal hidden sm:block">
              Job Scheduling Platform
            </p>
          </div>

          {/* Navigation Tabs (Hostinger Style) */}
          <nav className="hidden md:flex items-center gap-1 bg-panel-surface p-1 rounded-lg border border-panel-border">
            <button
              onClick={() => onTabChange('jobs')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'jobs'
                ? 'bg-panel-subtle text-white border border-panel-border shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Jobs</span>
            </button>
            <button
              onClick={() => onTabChange('runs')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'runs'
                ? 'bg-panel-subtle text-white border border-panel-border shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Global Runs</span>
            </button>
          </nav>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Mobile Tab Toggle */}
          <div className="flex md:hidden items-center bg-panel-surface rounded-lg border border-panel-border p-0.5">
            <button
              onClick={() => onTabChange('jobs')}
              className={`px-2.5 py-1 text-xs font-medium rounded ${activeTab === 'jobs' ? 'bg-panel-subtle text-white' : 'text-slate-400'}`}
            >
              Jobs
            </button>
            <button
              onClick={() => onTabChange('runs')}
              className={`px-2.5 py-1 text-xs font-medium rounded ${activeTab === 'runs' ? 'bg-panel-subtle text-white' : 'text-slate-400'}`}
            >
              Runs
            </button>
          </div>

          {/* Gateway Status Badge */}
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-xs"
            title="Gateway Connected (Port 8080) — System Operational"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span>Gateway 8080: UP</span>
          </div>

          {/* Auto-Refresh Toggle */}
          <button
            onClick={onToggleAutoRefresh}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${autoRefresh
              ? 'bg-panel-subtle text-white border-panel-border'
              : 'bg-panel-surface text-slate-400 border-panel-border hover:text-slate-200'
              }`}
            title="Auto polls status every 10 seconds"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            <span className="hidden sm:inline">Sync</span> 10s
          </button>

          {/* Manual Refresh */}
          <button
            onClick={onManualRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-panel-surface border border-panel-border text-slate-300 hover:text-white hover:border-slate-700 transition-colors disabled:opacity-50"
            title="Refresh now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-hostinger-400' : ''}`} />
          </button>

          {/* + New Job Primary CTA (Solid Hostinger Violet) */}
          <button
            onClick={onOpenCreateModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-hostinger-600 hover:bg-hostinger-700 text-white font-medium text-xs sm:text-sm transition-colors shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>New Job</span>
          </button>
        </div>
      </div>
    </header>
  );
};
