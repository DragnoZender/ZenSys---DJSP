import { Job, CreateJobPayload, UpdateJobPayload, SystemHealth } from '../types/job';
import { INITIAL_MOCK_JOBS } from './mockData';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const STORAGE_KEY = 'zensys_djsp_mock_jobs_v1';
const FORCE_MOCK_KEY = 'zensys_djsp_force_mock';

// Initialize mock store in localStorage if empty
function getLocalMockJobs(): Job[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Could not read from localStorage:', e);
  }
  saveLocalMockJobs(INITIAL_MOCK_JOBS);
  return INITIAL_MOCK_JOBS;
}

function saveLocalMockJobs(jobs: Job[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch (e) {
    console.warn('Could not write to localStorage:', e);
  }
}

export const apiService = {
  getForceMock(): boolean {
    return localStorage.getItem(FORCE_MOCK_KEY) === 'true';
  },

  setForceMock(forced: boolean) {
    localStorage.setItem(FORCE_MOCK_KEY, forced ? 'true' : 'false');
  },

  resetMockData(): Job[] {
    saveLocalMockJobs(INITIAL_MOCK_JOBS);
    return INITIAL_MOCK_JOBS;
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
          isMockMode: false,
          lastChecked: new Date().toLocaleTimeString(),
        };
      }
    } catch {
      // Gateway unreachable
    }

    return {
      status: 'DOWN',
      gatewayUrl: BASE_URL || 'http://localhost:8080',
      isMockMode: true,
      lastChecked: new Date().toLocaleTimeString(),
    };
  },

  async getJobs(): Promise<{ jobs: Job[]; isMock: boolean }> {
    const isForced = this.getForceMock();
    if (!isForced) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(`${BASE_URL}/jobs`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const jobs: Job[] = await res.json();
          return { jobs, isMock: false };
        }
      } catch (err) {
        console.warn('Real gateway fetch failed, falling back to mock mode:', err);
      }
    }

    return { jobs: getLocalMockJobs(), isMock: true };
  },

  async getJobById(jobId: string): Promise<Job> {
    const isForced = this.getForceMock();
    if (!isForced) {
      try {
        const res = await fetch(`${BASE_URL}/jobs/${encodeURIComponent(jobId)}`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('Real gateway getJobById failed, checking mock:', err);
      }
    }

    const jobs = getLocalMockJobs();
    const found = jobs.find((j) => j.jobId === jobId);
    if (!found) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    return found;
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
          // If response was JSON with jobId field
          try {
            const parsed = JSON.parse(text);
            if (parsed.jobId) jobId = parsed.jobId;
          } catch {
            // response was plain string
          }
          return { jobId, isMock: false };
        }
      } catch (err) {
        console.warn('Create job real API failed, saving to mock store:', err);
      }
    }

    // Mock store implementation
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
      } catch (err) {
        console.warn('Update job real API failed, saving to mock store:', err);
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
      } catch (err) {
        console.warn('Delete job real API failed, deleting in mock store:', err);
      }
    }

    const currentJobs = getLocalMockJobs();
    const filtered = currentJobs.filter((j) => j.jobId !== jobId);
    saveLocalMockJobs(filtered);
    return { success: true, isMock: true };
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
