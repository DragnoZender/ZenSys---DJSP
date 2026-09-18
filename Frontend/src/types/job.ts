export type ScheduleType = 'ONCE' | 'CRON' | 'INTERVAL';

export type JobStatus = 
  | 'SCHEDULED'
  | 'RUNNING'
  | 'PAUSED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'FAILED_PERMANENTLY';

export interface Job {
  jobId: string;
  name: string;
  scheduleType: ScheduleType;
  status: JobStatus;
  scheduleTime: string | null;      // ISO-8601 string (e.g., "2026-09-18T12:00:00Z")
  cronExpression: string | null;    // Standard 5/6-part cron (e.g., "0 0 12 * * ?")
  payload: string;                  // JSON string representing job arguments/payload
  retries: number;                  // Integer (e.g., 3)
  meta?: string;                    // JSON string for metadata/tags
  nextRunTime?: string | null;      // ISO-8601 string
  lastPolledTime?: string | null;   // ISO-8601 string
}

export interface CreateJobPayload {
  name: string;
  scheduleType: ScheduleType;
  scheduleTime?: string | null;     // Required if scheduleType === 'ONCE'
  cronExpression?: string | null;   // Required if scheduleType === 'CRON'
  payload: string;                  // Stringified JSON
  retries?: number;                 // Default: 3
  meta?: string;                    // Stringified JSON
}

export interface UpdateJobPayload {
  name: string;
  scheduleType: ScheduleType;
  status: JobStatus;
  scheduleTime?: string | null;
  cronExpression?: string | null;
  payload: string;
  retries?: number;
  meta?: string;
}

export interface SystemHealth {
  status: 'UP' | 'DOWN' | 'UNKNOWN';
  gatewayUrl: string;
  isMockMode: boolean;
  lastChecked: string;
}
