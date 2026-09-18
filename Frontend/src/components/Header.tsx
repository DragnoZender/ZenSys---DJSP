import React from 'react';
import { Plus, RefreshCw, Server, Radio, Database } from 'lucide-react';
import { SystemHealth } from '../types/job';

interface HeaderProps {
  health: SystemHealth;
  isRefreshing: boolean;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  onManualRefresh: () => void;
  onOpenCreateModal: () => void;
  onToggleForceMock: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  health,
  isRefreshing,
  autoRefresh,
  onToggleAutoRefresh,
  onManualRefresh,
  onOpenCreateModal,
  onToggleForceMock,
}) => {
  const isOnline = health.status === 'UP' && !health.isMockMode;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#080c14]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Logo & Brand Identity */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 shadow-lg shadow-brand-500/20 ring-1 ring-white/20">
            <Radio className="w-5 h-5 text-white" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                ZenSys
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                DJSP
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
              Distributed Job Scheduling & Orchestration
            </p>
          </div>
        </div>

        {/* Status Indicators & Action Controls */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Gateway Status Badge / Mode Toggle */}
          <button
            onClick={onToggleForceMock}
            title="Click to toggle between Live Gateway (Port 8080) and Demo Mode"
            className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
            }`}
          >
            {isOnline ? (
              <>
                <Server className="w-3.5 h-3.5 text-emerald-400" />
                <span>Gateway 8080: UP</span>
              </>
            ) : (
              <>
                <Database className="w-3.5 h-3.5 text-amber-400" />
                <span>Demo Mode (Mock Store)</span>
              </>
            )}
          </button>

          {/* Auto-Refresh Toggle */}
          <button
            onClick={onToggleAutoRefresh}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              autoRefresh
                ? 'bg-brand-500/10 text-brand-300 border-brand-500/30'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Auto polls status every 10 seconds"
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-brand-400 animate-pulse' : 'bg-slate-600'}`} />
            <span className="hidden sm:inline">Auto-Sync</span> 10s
          </button>

          {/* Manual Refresh Button */}
          <button
            onClick={onManualRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all disabled:opacity-50"
            title="Refresh jobs now"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-brand-400' : ''}`} />
          </button>

          {/* New Job CTA Button */}
          <button
            onClick={onOpenCreateModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-indigo-600 text-white font-medium text-xs sm:text-sm hover:from-brand-500 hover:to-indigo-500 transition-all shadow-md shadow-brand-500/25 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>New Job</span>
          </button>
        </div>
      </div>
    </header>
  );
};
