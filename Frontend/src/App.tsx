import { useState, useEffect, useCallback } from 'react';
import { Job, JobRun, JobStatus, ScheduleType, JobRunStatus, CreateJobPayload, UpdateJobPayload, SystemHealth } from './types/job';
import { apiService } from './services/api';
import { Header } from './components/Header';
import { MetricCards } from './components/MetricCards';
import { JobTable } from './components/JobTable';
import { GlobalRunsTable } from './components/GlobalRunsTable';
import { JobModal } from './components/JobModal';
import { JobDetailDrawer } from './components/JobDetailDrawer';
import { ToastContainer, ToastMessage } from './components/Toast';
import { RefreshCw, Layers, Activity } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<'jobs' | 'runs'>('jobs');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [health, setHealth] = useState<SystemHealth>({
    status: 'UNKNOWN',
    gatewayUrl: 'http://localhost:8080',
    isMockMode: false,
    lastChecked: '',
  });

  // Jobs Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<ScheduleType | 'ALL'>('ALL');

  // Runs Filters
  const [runsSearchQuery, setRunsSearchQuery] = useState('');
  const [runsStatusFilter, setRunsStatusFilter] = useState<JobRunStatus | 'ALL'>('ALL');

  // Modal and Drawer States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [viewingJob, setViewingJob] = useState<Job | null>(null);

  // Toast Notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: 'success' | 'error' | 'info', title: string, message?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    const duration = type === 'error' ? 7000 : 4000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Load Data
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsRefreshing(true);
    try {
      const [healthData, jobsData, runsData] = await Promise.all([
        apiService.checkHealth(),
        apiService.getJobs(statusFilter, typeFilter),
        apiService.getAllRuns(runsStatusFilter),
      ]);

      setHealth({
        ...healthData,
        status: 'UP',
        isMockMode: false,
      });

      setJobs(jobsData.jobs);
      setRuns(runsData.runs);

      setViewingJob((prev) => {
        if (!prev) return null;
        const updated = jobsData.jobs.find((j) => j.jobId === prev.jobId);
        if (!updated) return prev;
        if (
          prev.status === updated.status &&
          prev.name === updated.name &&
          prev.nextRunTime === updated.nextRunTime &&
          prev.lastPolledTime === updated.lastPolledTime &&
          prev.lastRunStatus === updated.lastRunStatus &&
          prev.payload === updated.payload &&
          prev.meta === updated.meta
        ) {
          return prev;
        }
        return updated;
      });
    } catch (err: any) {
      addToast('error', 'Sync Failed', err.message || 'Could not reach backend');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter, typeFilter, runsStatusFilter]);

  // Initial fetch
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-polling (every 10 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  // Actions
  const handleSaveJob = async (
    payload: CreateJobPayload | UpdateJobPayload,
    isEdit: boolean,
    jobId?: string
  ) => {
    try {
      if (isEdit && jobId) {
        await apiService.updateJob(jobId, payload as UpdateJobPayload);
        addToast(
          'success',
          'Job Updated',
          `Successfully updated ${payload.name}`
        );
      } else {
        const res = await apiService.createJob(payload as CreateJobPayload);
        addToast(
          'success',
          'Job Scheduled',
          `Assigned ID: ${res.jobId}`
        );
      }
      await loadData(true);
    } catch (err: any) {
      addToast(
        'error',
        isEdit ? 'Job Update Failed' : 'Job Creation Failed',
        err.message || 'Operation was rejected by the server'
      );
      throw err;
    }
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
      addToast('error', 'Status Update Failed', err.message || 'Backend rejected status change');
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
      addToast('error', 'Delete Failed', err.message || 'Server rejected delete operation');
    }
  };

  const handleTriggerRunNow = async (job: Job) => {
    try {
      const res = await apiService.triggerJobRunNow(job);
      addToast(
        'info',
        'Execution Dispatched',
        `Queued run ${res.run.runId} for ${job.name}`
      );
      await loadData(true);
    } catch (err: any) {
      addToast('error', 'Trigger Failed', err.message || 'Server rejected run trigger');
    }
  };

  const handleToggleForceMock = () => {
    loadData();
  };


  const handleJumpToJobFromRun = (jobId: string) => {
    const found = jobs.find((j) => j.jobId === jobId);
    if (found) {
      setActiveTab('jobs');
      setViewingJob(found);
    } else {
      addToast('info', 'Job Not Found', `Job ID ${jobId} not in local list`);
    }
  };

  // Client search filter for jobs
  const filteredJobs = jobs.filter((job) => {
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
    <div className="min-h-screen bg-panel-bg text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
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

        {/* Top Metric Cards */}
        <MetricCards
          activeTab={activeTab}
          jobs={jobs}
          runs={runs}
          activeJobStatusFilter={statusFilter}
          onSelectJobFilter={(status) => {
            setStatusFilter(status);
          }}
          activeRunStatusFilter={runsStatusFilter}
          onSelectRunFilter={(status) => {
            setRunsStatusFilter(status);
          }}
        />

        {/* Tab Content Header */}
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2.5">
            {activeTab === 'jobs' ? (
              <>
                <Layers className="w-5 h-5 text-hostinger-400" />
                <div>
                  <h1 className="text-base font-bold text-white tracking-tight">
                    Scheduled Jobs ({filteredJobs.length})
                  </h1>
                  <p className="text-xs text-slate-400">
                    Manage distributed schedules, operational triggers, and payload parameters.
                  </p>
                </div>
              </>
            ) : (
              <>
                <Activity className="w-5 h-5 text-hostinger-400" />
                <div>
                  <h1 className="text-base font-bold text-white tracking-tight">
                    Global Execution Runs ({runs.length})
                  </h1>
                  <p className="text-xs text-slate-400">
                    Monitor system-wide worker runs, diagnose pod errors, and inspect stack traces.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Active Tab View */}
        {isLoading ? (
          <div className="p-16 rounded-xl border border-panel-border bg-panel-surface flex flex-col items-center justify-center gap-2.5">
            <RefreshCw className="w-6 h-6 text-hostinger-400 animate-spin" />
            <span className="text-xs font-medium text-slate-400">Connecting to ZenSys DJSP Gateway...</span>
          </div>
        ) : activeTab === 'jobs' ? (
          <JobTable
            jobs={filteredJobs}
            runs={runs}
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
        ) : (
          <GlobalRunsTable
            runs={runs}
            statusFilter={runsStatusFilter}
            onStatusFilterChange={setRunsStatusFilter}
            searchQuery={runsSearchQuery}
            onSearchChange={setRunsSearchQuery}
            onSelectJob={handleJumpToJobFromRun}
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

      {/* Job Detail & Run History Drawer */}
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

      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Clean Footer */}
      <footer className="mt-auto border-t border-panel-border py-4 bg-panel-bg text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>ZenSys &bull; Enterprise Operations Dashboard</span>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Gateway: <code className="text-slate-400">{health.gatewayUrl}</code></span>
            <span>Last Polled: {health.lastChecked || 'Just now'}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
