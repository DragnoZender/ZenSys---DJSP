import { useState, useEffect, useCallback } from 'react';
import { Job, JobStatus, ScheduleType, CreateJobPayload, UpdateJobPayload, SystemHealth } from './types/job';
import { apiService } from './services/api';
import { Header } from './components/Header';
import { MetricCards } from './components/MetricCards';
import { JobTable } from './components/JobTable';
import { JobModal } from './components/JobModal';
import { JobDetailDrawer } from './components/JobDetailDrawer';
import { ToastContainer, ToastMessage } from './components/Toast';
import { Info, Sparkles, RefreshCw, Zap } from 'lucide-react';

export function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [health, setHealth] = useState<SystemHealth>({
    status: 'UNKNOWN',
    gatewayUrl: 'http://localhost:8080',
    isMockMode: false,
    lastChecked: '',
  });

  // Filter and Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<ScheduleType | 'ALL'>('ALL');

  // Modal and Drawer States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [viewingJob, setViewingJob] = useState<Job | null>(null);

  // Toast Notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: 'success' | 'error' | 'info', title: string, message?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Load Data
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsRefreshing(true);
    try {
      const [healthData, jobsData] = await Promise.all([
        apiService.checkHealth(),
        apiService.getJobs(),
      ]);
      const isMockActive = jobsData.isMock || healthData.isMockMode;
      setHealth({
        ...healthData,
        status: isMockActive ? 'DOWN' : 'UP',
        isMockMode: isMockActive,
      });
      setJobs(jobsData.jobs);

      // If we are currently viewing a job, refresh its details
      if (viewingJob) {
        const updatedViewing = jobsData.jobs.find((j) => j.jobId === viewingJob.jobId);
        if (updatedViewing) setViewingJob(updatedViewing);
      }
    } catch (err: any) {
      addToast('error', 'Sync Failed', err.message || 'Could not reach backend');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [viewingJob]);

  // Initial fetch
  useEffect(() => {
    loadData();
  }, []);

  // Auto-polling effect (every 10 seconds)
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      // Background silent refetch
      loadData(true);
    }, 10000);

    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  // Action Handlers
  const handleSaveJob = async (
    payload: CreateJobPayload | UpdateJobPayload,
    isEdit: boolean,
    jobId?: string
  ) => {
    if (isEdit && jobId) {
      const res = await apiService.updateJob(jobId, payload as UpdateJobPayload);
      addToast(
        'success',
        'Job Updated Successfully',
        res.isMock ? `Simulated update for ${payload.name}` : `Updated on Gateway: ${jobId}`
      );
    } else {
      const res = await apiService.createJob(payload as CreateJobPayload);
      addToast(
        'success',
        'Job Scheduled Successfully',
        `Assigned ID: ${res.jobId} ${res.isMock ? '(Demo Mode)' : ''}`
      );
    }
    await loadData(true);
  };

  const handleTogglePause = async (job: Job) => {
    try {
      const res = await apiService.toggleJobPause(job);
      const isNowPaused = res.status === 'PAUSED';
      addToast(
        'info',
        isNowPaused ? 'Job Suspended' : 'Job Resumed',
        `${job.name} is now ${res.status}`
      );
      await loadData(true);
    } catch (err: any) {
      addToast('error', 'Status Update Failed', err.message);
    }
  };

  const handleDeleteJob = async (job: Job) => {
    if (!confirm(`Are you sure you want to permanently delete job "${job.name}"?`)) {
      return;
    }
    try {
      await apiService.deleteJob(job.jobId);
      addToast('success', 'Job Deleted', `${job.name} removed permanently`);
      if (viewingJob?.jobId === job.jobId) {
        setViewingJob(null);
      }
      await loadData(true);
    } catch (err: any) {
      addToast('error', 'Delete Failed', err.message);
    }
  };

  const handleTriggerRunNow = (job: Job) => {
    addToast(
      'info',
      'Execution Dispatched',
      `Trigger signal queued for ${job.name} (ID: ${job.jobId})`
    );
  };

  const handleToggleForceMock = () => {
    const current = apiService.getForceMock();
    apiService.setForceMock(!current);
    addToast(
      'info',
      !current ? 'Switched to Demo Mock Mode' : 'Switched to Live Gateway Mode',
      !current ? 'All changes will persist locally' : 'Attempting to query http://localhost:8080'
    );
    loadData();
  };

  const handleResetMockJobs = () => {
    apiService.resetMockData();
    addToast('info', 'Demo Data Reset', 'Restored original sample jobs');
    loadData();
  };

  // Filter logic
  const filteredJobs = jobs.filter((job) => {
    // Status filter
    if (statusFilter !== 'ALL' && job.status !== statusFilter) {
      return false;
    }
    // Type filter
    if (typeFilter !== 'ALL' && job.scheduleType !== typeFilter) {
      return false;
    }
    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchName = job.name.toLowerCase().includes(query);
      const matchId = job.jobId.toLowerCase().includes(query);
      const matchPayload = job.payload.toLowerCase().includes(query);
      return matchName || matchId || matchPayload;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col selection:bg-brand-500/30 selection:text-brand-200">
      {/* Top Navigation */}
      <Header
        health={health}
        isRefreshing={isRefreshing}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh(!autoRefresh)}
        onManualRefresh={() => loadData()}
        onOpenCreateModal={() => {
          setEditingJob(null);
          setIsCreateModalOpen(true);
        }}
        onToggleForceMock={handleToggleForceMock}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Offline / Demo Notice Banner if Gateway is down */}
        {health.isMockMode && (
          <div className="mb-6 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Info className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Demo Mode Active</span>
                  <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    Offline Resilient
                  </span>
                </h3>
                <p className="text-xs text-amber-200/80 mt-0.5">
                  The API Gateway at <code className="text-amber-100 font-mono-code font-semibold">{health.gatewayUrl}</code> is currently offline. You can test all job operations locally with full persistence.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={handleResetMockJobs}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-colors"
              >
                Reset Demo Jobs
              </button>
              <button
                onClick={() => loadData()}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white shadow-sm transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Gateway</span>
              </button>
            </div>
          </div>
        )}

        {/* Metric Cards Overview */}
        <MetricCards
          jobs={jobs}
          activeStatusFilter={statusFilter}
          onSelectFilter={(status) => setStatusFilter(status)}
        />

        {/* Dashboard Title & Quick Stats */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
              <span>Scheduled Operations</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                {filteredJobs.length} {filteredJobs.length === 1 ? 'Job' : 'Jobs'}
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Inspect schedules, manage lifecycle states, and monitor real-time worker dispatch.
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" /> Gateway: Spring Cloud
            </span>
          </div>
        </div>

        {/* Interactive Jobs Table */}
        {isLoading ? (
          <div className="p-16 rounded-xl border border-slate-800/80 glass-panel flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-brand-400 animate-spin" />
            <span className="text-sm font-medium text-slate-400">Connecting to ZenSys Gateway...</span>
          </div>
        ) : (
          <JobTable
            jobs={filteredJobs}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            onViewJob={(job) => setViewingJob(job)}
            onEditJob={(job) => {
              setEditingJob(job);
              setIsCreateModalOpen(true);
            }}
            onTogglePause={handleTogglePause}
            onDeleteJob={handleDeleteJob}
            onCopyId={(id) => addToast('info', 'Copied to Clipboard', id)}
          />
        )}
      </main>

      {/* Create / Edit Job Modal */}
      <JobModal
        isOpen={isCreateModalOpen}
        jobToEdit={editingJob}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingJob(null);
        }}
        onSave={handleSaveJob}
      />

      {/* Job Detail Slide-over Drawer */}
      <JobDetailDrawer
        job={viewingJob}
        isOpen={!!viewingJob}
        onClose={() => setViewingJob(null)}
        onEdit={(job) => {
          setViewingJob(null);
          setEditingJob(job);
          setIsCreateModalOpen(true);
        }}
        onTogglePause={handleTogglePause}
        onDelete={handleDeleteJob}
        onTriggerNow={handleTriggerRunNow}
      />

      {/* Action Feedback Toasts */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800/80 py-4 bg-[#05070d]/80 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-brand-400" />
            <span>ZenSys DJSP Operations Dashboard</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Base Gateway: <code className="text-slate-400">{health.gatewayUrl}</code></span>
            <span>Last Sync: {health.lastChecked || 'Just now'}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
