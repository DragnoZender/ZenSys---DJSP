import { Job, JobRun, JobStatus, ScheduleType, JobRunStatus, CreateJobPayload, UpdateJobPayload, SystemHealth } from '../types/job';
import { INITIAL_MOCK_JOBS, INITIAL_MOCK_RUNS } from './mockData';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const JOBS_STORAGE_KEY = 'zensys_djsp_mock_jobs_v2';
const RUNS_STORAGE_KEY = 'zensys_djsp_mock_runs_v2';
const FORCE_MOCK_KEY = 'zensys_djsp_force_mock';

// Local Mock Stores
function getLocalMockJobs(): Job[] {
  try {
    const stored = localStorage.getItem(JOBS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
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
      return JSON.parse(stored);
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

export const apiService = {
  getForceMock(): boolean {
    return localStorage.getItem(FORCE_MOCK_KEY) === 'true';
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
    const isForcedMock = this.getForceMock();
    if (isForcedMock) {
      return {
        status: 'DOWN',
        gatewayUrl: BASE_URL || 'http://localhost:8080',
        isMockMode: true,
        lastChecked: new Date().toLocaleTimeString(),
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${BASE_URL}/actuator/health`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        return {
          status: data.status === 'UP' ? 'UP' : 'DOWN',
          gatewayUrl: BASE_URL || 'http://localhost:8080',
          isMockMode: data.status !== 'UP',
          lastChecked: new Date().toLocaleTimeString(),
        };
      }
    } catch {
      // Gateway down
    }

    return {
      status: 'DOWN',
      gatewayUrl: BASE_URL || 'http://localhost:8080',
      isMockMode: true,
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
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const jobs: Job[] = await res.json();
          return { jobs, isMock: false };
        }
      } catch {
        // Fall back to mock
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
      } catch {
        // Fall back
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
      } catch {
        // Fall back
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
      } catch {
        // Fall back
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
      } catch {
        // Fall back
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
      } catch {
        // Fall back
      }
    }

    // Mock store creation
    const randomSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();
    const newJobId = `01J8${Date.now().toString(36).toUpperCase()}${randomSuffix}`.padEnd(26, '0');

    let calculatedNextRun: string | null = null;
    if (payload.scheduleType === 'ONCE') {
      calculatedNextRun = payload.scheduleTime || null;
    } else if (payload.scheduleType === 'CRON') {
      calculatedNextRun = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    } else {
      calculatedNextRun = new Date(Date.now() + 1000 * 60 * 10).toISOString();
    }

    const newJob: Job = {
      jobId: newJobId,
      name: payload.name,
      scheduleType: payload.scheduleType,
      status: 'SCHEDULED',
      scheduleTime: payload.scheduleTime || null,
      cronExpression: payload.cronExpression || null,
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
      } catch {
        // Fall back
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
          scheduleTime: payload.scheduleTime ?? j.scheduleTime,
          cronExpression: payload.cronExpression ?? j.cronExpression,
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
      } catch {
        // Fall back
      }
    }

    const currentJobs = getLocalMockJobs();
    saveLocalMockJobs(currentJobs.filter((j) => j.jobId !== jobId));
    return { success: true, isMock: true };
  },

  async triggerJobRunNow(job: Job): Promise<{ run: JobRun; isMock: boolean }> {
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
