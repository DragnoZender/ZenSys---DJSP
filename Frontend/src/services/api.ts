import { Job, JobRun, JobStatus, ScheduleType, JobRunStatus, CreateJobPayload, UpdateJobPayload, SystemHealth } from '../types/job';
import { INITIAL_MOCK_JOBS, INITIAL_MOCK_RUNS } from './mockData';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const JOBS_STORAGE_KEY = 'zensys_djsp_mock_jobs_v4';
const RUNS_STORAGE_KEY = 'zensys_djsp_mock_runs_v4';
const FORCE_MOCK_KEY = 'zensys_djsp_force_mock';

// Local Mock Stores
function getLocalMockJobs(): Job[] {
  try {
    const stored = localStorage.getItem(JOBS_STORAGE_KEY);
    if (stored) {
      const parsed: Job[] = JSON.parse(stored);
      // Ensure recurring jobs (CRON or INTERVAL) that executed return to SCHEDULED for their next run, never COMPLETED
      let hasChange = false;
      const sanitized = parsed.map((j) => {
        if ((j.scheduleType === 'CRON' || j.scheduleType === 'INTERVAL') && j.status === 'COMPLETED') {
          hasChange = true;
          return { ...j, status: 'SCHEDULED' as JobStatus };
        }
        return j;
      });
      if (hasChange) {
        saveLocalMockJobs(sanitized);
      }
      return sanitized;
    }
  } catch (e) {
    console.info('Using initial mock jobs:', e);
  }
  saveLocalMockJobs(INITIAL_MOCK_JOBS);
  return INITIAL_MOCK_JOBS;
}

function saveLocalMockJobs(jobs: Job[]) {
  try {
    localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
  } catch (e) {
    console.warn('Could not save jobs to localStorage:', e);
  }
}

function getLocalMockRuns(): JobRun[] {
  try {
    const stored = localStorage.getItem(RUNS_STORAGE_KEY);
    if (stored) {
      const parsed: JobRun[] = JSON.parse(stored);
      // Synchronize latest properties from INITIAL_MOCK_RUNS (e.g. executorId code edits)
      const initialMap = new Map(INITIAL_MOCK_RUNS.map((r) => [r.runId, r]));
      let hasUpdates = false;
      const updatedRuns = parsed.map((run) => {
        const fresh = initialMap.get(run.runId);
        if (fresh && fresh.executorId !== run.executorId) {
          hasUpdates = true;
          return { ...run, executorId: fresh.executorId };
        }
        return run;
      });

      const existingRunIds = new Set(updatedRuns.map((r) => r.runId));
      const missingInitial = INITIAL_MOCK_RUNS.filter((r) => !existingRunIds.has(r.runId));
      if (missingInitial.length > 0 || hasUpdates) {
        const merged = [...updatedRuns, ...missingInitial];
        saveLocalMockRuns(merged);
        return merged;
      }
      return updatedRuns;
    }
  } catch (e) {
    console.info('Using initial mock runs:', e);
  }
  saveLocalMockRuns(INITIAL_MOCK_RUNS);
  return INITIAL_MOCK_RUNS;
}

function saveLocalMockRuns(runs: JobRun[]) {
  try {
    localStorage.setItem(RUNS_STORAGE_KEY, JSON.stringify(runs));
  } catch (e) {
    console.warn('Could not save runs to localStorage:', e);
  }
}

/**
 * Parses and extracts a human-readable error message from a backend error response.
 */
async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await res.json();
      if (json.message) return json.message;
      if (json.error) {
        return typeof json.error === 'string'
          ? (json.message ? `${json.error}: ${json.message}` : json.error)
          : JSON.stringify(json.error);
      }
      if (json.errors && Array.isArray(json.errors)) {
        return json.errors
          .map((e: any) => e.defaultMessage || e.message || JSON.stringify(e))
          .join(', ');
      }
      return JSON.stringify(json);
    }
    const text = await res.text();
    if (text && text.trim().length > 0 && text.length < 500 && !text.includes('<!DOCTYPE')) {
      return text.trim();
    }
  } catch {
    // fallback
  }
  return `Backend returned HTTP ${res.status} (${res.statusText || 'Error'})`;
}

/**
 * Determines if the response is from Vite's proxy indicating the gateway on port 8080 is unreachable.
 */
async function isGatewayOfflineResponse(res: Response): Promise<boolean> {
  if (res.status === 503) {
    try {
      const cloned = res.clone();
      const data = await cloned.json();
      if (data && data.code === 'GATEWAY_DOWN') {
        return true;
      }
    } catch {
      // not gateway down JSON
    }
  }
  return false;
}

export const apiService = {
  getForceMock(): boolean {
    const stored = localStorage.getItem(FORCE_MOCK_KEY);
    if (stored === 'false') return false;
    return true; // Default to true (Standalone Mock Mode)
  },

  setForceMock(forced: boolean) {
    localStorage.setItem(FORCE_MOCK_KEY, forced ? 'true' : 'false');
  },

  resetMockData() {
    saveLocalMockJobs(INITIAL_MOCK_JOBS);
    saveLocalMockRuns(INITIAL_MOCK_RUNS);
    return { jobs: INITIAL_MOCK_JOBS, runs: INITIAL_MOCK_RUNS };
  },

  async checkHealth(): Promise<SystemHealth> {
    return {
      status: 'UP',
      gatewayUrl: 'http://localhost:8080',
      isMockMode: false,
      lastChecked: new Date().toLocaleTimeString(),
    };
  },

  async getJobs(status?: JobStatus | 'ALL', scheduleType?: ScheduleType | 'ALL'): Promise<{ jobs: Job[]; isMock: boolean }> {
    const isForced = this.getForceMock();
    if (!isForced) {
      try {
        const params = new URLSearchParams();
        if (status && status !== 'ALL') params.set('status', status);
        if (scheduleType && scheduleType !== 'ALL') params.set('scheduleType', scheduleType);

        const url = `${BASE_URL}/jobs${params.toString() ? `?${params.toString()}` : ''}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const jobs: Job[] = await res.json();
          return { jobs, isMock: false };
        }

        const isOffline = await isGatewayOfflineResponse(res);
        if (!isOffline) {
          const errorMsg = await extractErrorMessage(res);
          throw new Error(errorMsg);
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('aborted')) {
          throw err;
        }
      }
    }

    let jobs = getLocalMockJobs();
    if (status && status !== 'ALL') {
      jobs = jobs.filter(j => j.status === status);
    }
    if (scheduleType && scheduleType !== 'ALL') {
      jobs = jobs.filter(j => j.scheduleType === scheduleType);
    }
    return { jobs, isMock: true };
  },

  async getJobById(jobId: string): Promise<Job> {
    const isForced = this.getForceMock();
    if (!isForced) {
      try {
        const res = await fetch(`${BASE_URL}/jobs/${encodeURIComponent(jobId)}`);
        if (res.ok) {
          return await res.json();
        }
        const isOffline = await isGatewayOfflineResponse(res);
        if (!isOffline) {
          const errorMsg = await extractErrorMessage(res);
          throw new Error(errorMsg);
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('Failed to fetch')) {
          throw err;
        }
      }
    }

    const jobs = getLocalMockJobs();
    const found = jobs.find((j) => j.jobId === jobId);
    if (!found) throw new Error(`Job with ID ${jobId} not found`);
    return found;
  },

  async getJobRuns(jobId: string): Promise<{ runs: JobRun[]; isMock: boolean }> {
    const isForced = this.getForceMock();
    if (!isForced) {
      try {
        const res = await fetch(`${BASE_URL}/jobs/${encodeURIComponent(jobId)}/runs`);
        if (res.ok) {
          const runs: JobRun[] = await res.json();
          return { runs, isMock: false };
        }
        const isOffline = await isGatewayOfflineResponse(res);
        if (!isOffline) {
          const errorMsg = await extractErrorMessage(res);
          throw new Error(errorMsg);
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('Failed to fetch')) {
          throw err;
        }
      }
    }

    const allRuns = getLocalMockRuns();
    const runsForJob = allRuns.filter(r => r.jobId === jobId);
    return { runs: runsForJob, isMock: true };
  },

  async getRunById(runId: string): Promise<JobRun> {
    const isForced = this.getForceMock();
    if (!isForced) {
      try {
        const res = await fetch(`${BASE_URL}/jobs/runs/${encodeURIComponent(runId)}`);
        if (res.ok) {
          return await res.json();
        }
        const isOffline = await isGatewayOfflineResponse(res);
        if (!isOffline) {
          const errorMsg = await extractErrorMessage(res);
          throw new Error(errorMsg);
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('Failed to fetch')) {
          throw err;
        }
      }
    }

    const allRuns = getLocalMockRuns();
    const run = allRuns.find(r => r.runId === runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    return run;
  },

  async getAllRuns(statusFilter?: JobRunStatus | 'ALL'): Promise<{ runs: JobRun[]; isMock: boolean }> {
    const isForced = this.getForceMock();
    if (!isForced) {
      try {
        const query = statusFilter && statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
        const res = await fetch(`${BASE_URL}/jobs/runs${query}`);
        if (res.ok) {
          const runs: JobRun[] = await res.json();
          return { runs, isMock: false };
        }
        const isOffline = await isGatewayOfflineResponse(res);
        if (!isOffline) {
          const errorMsg = await extractErrorMessage(res);
          throw new Error(errorMsg);
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('Failed to fetch')) {
          throw err;
        }
      }
    }

    let allRuns = getLocalMockRuns();
    if (statusFilter && statusFilter !== 'ALL') {
      allRuns = allRuns.filter(r => r.status === statusFilter);
    }
    return { runs: allRuns, isMock: true };
  },

  async createJob(payload: CreateJobPayload): Promise<{ jobId: string; isMock: boolean }> {
    const isForced = this.getForceMock();
    if (!isForced) {
      try {
        const res = await fetch(`${BASE_URL}/jobs/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const text = await res.text();
          let jobId = text.replace(/["\r\n]/g, '').trim();
          try {
            const parsed = JSON.parse(text);
            if (parsed.jobId) jobId = parsed.jobId;
          } catch {
            // raw string
          }
          return { jobId, isMock: false };
        }

        // Check if gateway on port 8080 is unreachable
        const isOffline = await isGatewayOfflineResponse(res);
        if (!isOffline) {
          // Real backend error (400, 404, 409, 500, etc.) - DO NOT swallow!
          const errorMsg = await extractErrorMessage(res);
          throw new Error(errorMsg);
        }
      } catch (err: any) {
        // Rethrow real backend or validation errors
        if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
          throw err;
        }
      }
    }

    // Mock store creation (only used when demo mode or gateway offline)
    const randomSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();
    const newJobId = `01J8${Date.now().toString(36).toUpperCase()}${randomSuffix}`.padEnd(26, '0');

    let calculatedNextRun: string | null = null;
    if (payload.scheduleType === 'ONCE') {
      calculatedNextRun = payload.scheduleTime || null;
    } else if (payload.scheduleType === 'CRON') {
      calculatedNextRun = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    } else {
      let intervalSec = 60;
      if (payload.meta) {
        try {
          const m = JSON.parse(payload.meta);
          if (m.intervalSeconds) intervalSec = Number(m.intervalSeconds);
          else if (m.interval) intervalSec = Number(m.interval);
        } catch {
          const match = payload.meta.match(/"intervalSeconds"\s*:\s*(\d+)/) || payload.meta.match(/"interval"\s*:\s*(\d+)/);
          if (match) intervalSec = Number(match[1]);
        }
      }
      calculatedNextRun = new Date(Date.now() + 1000 * Math.max(1, intervalSec)).toISOString();
    }

    const newJob: Job = {
      jobId: newJobId,
      name: payload.name,
      scheduleType: payload.scheduleType,
      status: 'SCHEDULED',
      scheduleTime: payload.scheduleType === 'ONCE' ? (payload.scheduleTime || null) : null,
      cronExpression: payload.scheduleType === 'CRON' ? (payload.cronExpression || null) : null,
      payload: payload.payload,
      retries: payload.retries ?? 3,
      meta: payload.meta,
      nextRunTime: calculatedNextRun,
      lastPolledTime: null,
      lastRunStatus: undefined,
    };

    const currentJobs = getLocalMockJobs();
    saveLocalMockJobs([newJob, ...currentJobs]);
    return { jobId: newJobId, isMock: true };
  },

  async updateJob(jobId: string, payload: UpdateJobPayload): Promise<{ success: boolean; isMock: boolean }> {
    const isForced = this.getForceMock();
    if (!isForced) {
      try {
        const res = await fetch(`${BASE_URL}/jobs/update/${encodeURIComponent(jobId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          return { success: true, isMock: false };
        }

        const isOffline = await isGatewayOfflineResponse(res);
        if (!isOffline) {
          const errorMsg = await extractErrorMessage(res);
          throw new Error(errorMsg);
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
          throw err;
        }
      }
    }

    const currentJobs = getLocalMockJobs();
    const updated = currentJobs.map((j) => {
      if (j.jobId === jobId) {
        return {
          ...j,
          name: payload.name,
          scheduleType: payload.scheduleType,
          status: payload.status,
          scheduleTime: payload.scheduleType === 'ONCE' ? (payload.scheduleTime ?? j.scheduleTime) : null,
          cronExpression: payload.scheduleType === 'CRON' ? (payload.cronExpression ?? j.cronExpression) : null,
          payload: payload.payload,
          retries: payload.retries ?? j.retries,
          meta: payload.meta ?? j.meta,
        };
      }
      return j;
    });

    saveLocalMockJobs(updated);
    return { success: true, isMock: true };
  },

  async deleteJob(jobId: string): Promise<{ success: boolean; isMock: boolean }> {
    const isForced = this.getForceMock();
    if (!isForced) {
      try {
        const res = await fetch(`${BASE_URL}/jobs/delete/${encodeURIComponent(jobId)}`, {
          method: 'DELETE',
        });

        if (res.ok) {
          return { success: true, isMock: false };
        }

        const isOffline = await isGatewayOfflineResponse(res);
        if (!isOffline) {
          const errorMsg = await extractErrorMessage(res);
          throw new Error(errorMsg);
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
          throw err;
        }
      }
    }

    const currentJobs = getLocalMockJobs();
    saveLocalMockJobs(currentJobs.filter((j) => j.jobId !== jobId));
    return { success: true, isMock: true };
  },

  async triggerJobRunNow(job: Job): Promise<{ run: JobRun; isMock: boolean }> {
    const isForced = this.getForceMock();
    if (!isForced) {
      try {
        const res = await fetch(`${BASE_URL}/jobs/${encodeURIComponent(job.jobId)}/run`, {
          method: 'POST',
        });

        if (res.ok) {
          const run: JobRun = await res.json();
          return { run, isMock: false };
        }

        const isOffline = await isGatewayOfflineResponse(res);
        if (!isOffline && res.status !== 404 && res.status !== 501) {
          const errorMsg = await extractErrorMessage(res);
          throw new Error(errorMsg);
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('Failed to fetch')) {
          throw err;
        }
      }
    }

    const newRunId = `01J8RUN${Date.now().toString(36).toUpperCase()}`.padEnd(26, '0');
    const newRun: JobRun = {
      id: Math.floor(Math.random() * 1000) + 200,
      runId: newRunId,
      jobId: job.jobId,
      status: 'RUNNING',
      startTime: new Date().toISOString(),
      endTime: null,
      modificationTime: new Date().toISOString(),
      executorId: `executor-worker-${Math.floor(Math.random() * 10) + 1}`,
      attemptNumber: 1,
      executionTimeMs: 0,
      errorMsg: null,
    };

    const currentRuns = getLocalMockRuns();
    saveLocalMockRuns([newRun, ...currentRuns]);

    // Update job state: CRON and INTERVAL jobs stay SCHEDULED; ONCE goes to RUNNING
    const currentJobs = getLocalMockJobs();
    const updatedJobs = currentJobs.map((j) => {
      if (j.jobId === job.jobId) {
        return {
          ...j,
          lastPolledTime: new Date().toISOString(),
          lastRunStatus: 'RUNNING' as JobRunStatus,
          status: (j.status === 'PAUSED' ? 'PAUSED' : (j.scheduleType === 'ONCE' ? 'RUNNING' : 'SCHEDULED')) as JobStatus,
        };
      }
      return j;
    });
    saveLocalMockJobs(updatedJobs);

    // Simulate completion: ONCE moves to COMPLETED; CRON and INTERVAL return to SCHEDULED for next run
    setTimeout(() => {
      try {
        const runs = getLocalMockRuns();
        const duration = Math.floor(Math.random() * 2000) + 800;
        const finalizedRuns = runs.map((r) => {
          if (r.runId === newRunId) {
            return {
              ...r,
              status: 'SUCCESS' as JobRunStatus,
              endTime: new Date().toISOString(),
              modificationTime: new Date().toISOString(),
              executionTimeMs: duration,
            };
          }
          return r;
        });
        saveLocalMockRuns(finalizedRuns);

        const jobs = getLocalMockJobs();
        const finalizedJobs = jobs.map((j) => {
          if (j.jobId === job.jobId) {
            // For ONCE, job is COMPLETED.
            // For recurring CRON and INTERVAL jobs, it goes back to SCHEDULED for tomorrow/next interval!
            const newJobStatus: JobStatus = j.status === 'PAUSED' 
              ? 'PAUSED' 
              : (j.scheduleType === 'ONCE' ? 'COMPLETED' : 'SCHEDULED');

            let nextRun = j.nextRunTime;
            if (j.scheduleType === 'CRON') {
              nextRun = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
            } else if (j.scheduleType === 'INTERVAL') {
              nextRun = new Date(Date.now() + 1000 * 300).toISOString();
            }

            return {
              ...j,
              status: newJobStatus,
              lastRunStatus: 'SUCCESS' as JobRunStatus,
              lastPolledTime: new Date().toISOString(),
              nextRunTime: nextRun,
            };
          }
          return j;
        });
        saveLocalMockJobs(finalizedJobs);
      } catch (err) {
        console.warn('Could not finalize simulated run:', err);
      }
    }, 2500);

    return { run: newRun, isMock: true };
  },

  async toggleJobPause(job: Job): Promise<{ status: Job['status']; isMock: boolean }> {
    const newStatus: Job['status'] = job.status === 'PAUSED' ? 'SCHEDULED' : 'PAUSED';
    const updatePayload: UpdateJobPayload = {
      name: job.name,
      scheduleType: job.scheduleType,
      status: newStatus,
      scheduleTime: job.scheduleTime,
      cronExpression: job.cronExpression,
      payload: job.payload,
      retries: job.retries,
      meta: job.meta,
    };
    const res = await this.updateJob(job.jobId, updatePayload);
    return { status: newStatus, isMock: res.isMock };
  },
};
