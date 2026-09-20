# Frontend Specification & API Integration Document
**Project:** ZenSys Distributed Job Scheduling Platform (ZenSys DJSP)  
**Target Audience:** Frontend Engineers / UI Developers  
**Base Gateway URL:** `http://localhost:8080` (or `VITE_API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL`)

---

## 1. System Overview

ZenSys DJSP is an enterprise distributed job scheduling platform (similar to Airflow/Temporal/Quartz).
The frontend acts as an **Operations Dashboard** where engineers and operators can:
- Monitor and search scheduled, running, paused, and completed jobs.
- Filter jobs by operational status and schedule type.
- Inspect detailed execution history (`job_runs`), execution durations, attempt counts, and error logs for debugging.
- Create new jobs (One-time, Cron-scheduled, or Interval-based).
- Update job configurations (schedules, payloads, retry limits).
- Delete or cancel scheduled jobs.

### Architecture Note for Frontend
All API requests must go through the **API Gateway** on port **`8080`**. The Gateway handles intelligent internal routing:
- **Read Operations (`GET /jobs/**`)** ➔ Routed to `job-search-service`
- **Write Operations (`POST`, `PUT`, `DELETE /jobs/**`)** ➔ Routed to `job-service`

---

## 2. TypeScript Data Models & Enums

Share these types directly in your frontend project (e.g., `src/types/job.ts`):

```typescript
export type ScheduleType = 'ONCE' | 'CRON' | 'INTERVAL';

export type JobStatus = 
  | 'SCHEDULED'
  | 'RUNNING'
  | 'PAUSED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'FAILED_PERMANENTLY';

export type JobRunStatus = 
  | 'PENDING'
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'EXECUTOR_DIED';

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

export interface JobRun {
  id: number;
  runId: string;                    // ULID / 26-char unique run identifier
  jobId: string;                    // Foreign key referencing Job
  status: JobRunStatus;
  startTime: string | null;         // ISO-8601 timestamp
  endTime: string | null;           // ISO-8601 timestamp
  modificationTime: string;         // ISO-8601 timestamp
  executorId: string | null;        // ID of the worker/pod executing the run
  attemptNumber: number;            // Current retry attempt (1, 2, 3...)
  executionTimeMs: number | null;   // Run duration in milliseconds
  errorMsg: string | null;          // Error message / stack trace if failed
}

export interface CreateJobPayload {
  name: string;
  scheduleType: ScheduleType;
  scheduleTime?: string;            // Required if scheduleType === 'ONCE'
  cronExpression?: string;          // Required if scheduleType === 'CRON'
  payload: string;                  // Stringified JSON
  retries?: number;                 // Default: 3
  meta?: string;                    // Stringified JSON
}

export interface UpdateJobPayload {
  name: string;
  scheduleType: ScheduleType;
  status: JobStatus;
  scheduleTime?: string;
  cronExpression?: string;
  payload: string;
  retries?: number;
  meta?: string;
}
```

---

## 3. API Contract Reference

All endpoints accept and return `Content-Type: application/json`.

### 3.1. List Jobs (With Optional Filters)
- **Endpoint:** `GET /jobs`
- **Description:** Returns jobs in the system, with optional query filtering by status and schedule type.
- **Query Parameters (Optional):**
  - `status`: Filter by `JobStatus` (`SCHEDULED`, `RUNNING`, `PAUSED`, `CANCELLED`, `COMPLETED`, `FAILED_PERMANENTLY`)
  - `scheduleType`: Filter by `ScheduleType` (`ONCE`, `CRON`, `INTERVAL`)
- **Example Request:** `GET /jobs?status=SCHEDULED&scheduleType=CRON`
- **Response `200 OK`:**
  ```json
  [
    {
      "jobId": "01J82N4XYZ0000000000000000",
      "name": "Database Backup Pipeline",
      "scheduleType": "CRON",
      "status": "SCHEDULED",
      "scheduleTime": null,
      "cronExpression": "0 0 2 * * ?",
      "payload": "{\"target\": \"s3://backups\", \"compress\": true}",
      "retries": 3,
      "meta": "{\"environment\": \"production\", \"priority\": \"high\"}",
      "nextRunTime": "2026-09-19T02:00:00Z",
      "lastPolledTime": "2026-09-18T12:00:00Z"
    }
  ]
  ```

---

### 3.2. Get Single Job Details
- **Endpoint:** `GET /jobs/{jobId}`
- **Description:** Returns detailed metadata for a single job.
- **Response `200 OK`:** Returns a single `Job` object.
- **Response `404 Not Found`:** Job does not exist.

---

### 3.3. Get Execution History for a Job
- **Endpoint:** `GET /jobs/{jobId}/runs`
- **Description:** Returns all execution runs for the specified job, ordered from newest to oldest (`startTime DESC`).
- **Response `200 OK`:**
  ```json
  [
    {
      "id": 104,
      "runId": "01J82NRUN00000000000000001",
      "jobId": "01J82N4XYZ0000000000000000",
      "status": "SUCCESS",
      "startTime": "2026-09-20T02:00:00.100Z",
      "endTime": "2026-09-20T02:00:04.350Z",
      "modificationTime": "2026-09-20T02:00:04.352Z",
      "executorId": "executor-pod-us-east-4a",
      "attemptNumber": 1,
      "executionTimeMs": 4250,
      "errorMsg": null
    },
    {
      "id": 89,
      "runId": "01J82NRUN00000000000000002",
      "jobId": "01J82N4XYZ0000000000000000",
      "status": "FAILED",
      "startTime": "2026-09-19T02:00:00.080Z",
      "endTime": "2026-09-19T02:00:01.200Z",
      "modificationTime": "2026-09-19T02:00:01.202Z",
      "executorId": "executor-pod-us-east-2b",
      "attemptNumber": 1,
      "executionTimeMs": 1120,
      "errorMsg": "S3BucketNotFoundException: Bucket 'backups' was not reachable"
    }
  ]
  ```
- **Response `404 Not Found`:** Job does not exist.

---

### 3.4. Get Single Run Details
- **Endpoint:** `GET /jobs/runs/{runId}`
- **Description:** Returns details of a specific execution run instance (e.g. for error inspection drawer or log viewer).
- **Response `200 OK`:**
  ```json
  {
    "id": 89,
    "runId": "01J82NRUN00000000000000002",
    "jobId": "01J82N4XYZ0000000000000000",
    "status": "FAILED",
    "startTime": "2026-09-19T02:00:00.080Z",
    "endTime": "2026-09-19T02:00:01.200Z",
    "modificationTime": "2026-09-19T02:00:01.202Z",
    "executorId": "executor-pod-us-east-2b",
    "attemptNumber": 1,
    "executionTimeMs": 1120,
    "errorMsg": "S3BucketNotFoundException: Bucket 'backups' was not reachable"
  }
  ```
- **Response `404 Not Found`:** Run instance not found.

---

### 3.5. List All Runs (With Status Filter)
- **Endpoint:** `GET /jobs/runs`
- **Description:** Returns execution runs across all jobs. Useful for a global "Live Runs" or "Failures & Alerts" operational view.
- **Query Parameters (Optional):**
  - `status`: Filter by `JobRunStatus` (`PENDING`, `QUEUED`, `RUNNING`, `SUCCESS`, `FAILED`, `TIMEOUT`, `CANCELLED`, `EXECUTOR_DIED`)
- **Example Request:** `GET /jobs/runs?status=FAILED`
- **Response `200 OK`:** Returns array of `JobRun` objects.

---

### 3.6. Create New Job
- **Endpoint:** `POST /jobs/create`
- **Description:** Registers and schedules a new job.
- **Request Body:**
  ```json
  {
    "name": "Hourly Cache Warmer",
    "scheduleType": "CRON",
    "cronExpression": "0 0 * * * ?",
    "scheduleTime": null,
    "payload": "{\"service\": \"user-profile\", \"cacheKeys\": [\"featured\", \"top_sellers\"]}",
    "retries": 3,
    "meta": "{\"team\": \"platform\"}"
  }
  ```
- **Response `200 OK`:**
  ```text
  01J82N4XYZ0000000000000000
  ```
  *(Returns the newly generated `jobId` string)*

---

### 3.7. Update Existing Job
- **Endpoint:** `PUT /jobs/update/{jobId}`
- **Description:** Updates job configuration or transitions its status (e.g., pause, resume).
- **Request Body:**
  ```json
  {
    "name": "Hourly Cache Warmer - Updated",
    "scheduleType": "CRON",
    "status": "PAUSED",
    "cronExpression": "0 30 * * * ?",
    "scheduleTime": null,
    "payload": "{\"service\": \"user-profile\"}",
    "retries": 5,
    "meta": "{\"team\": \"platform\"}"
  }
  ```
- **Response `200 OK`:** Success message.

---

### 3.8. Delete Job
- **Endpoint:** `DELETE /jobs/delete/{jobId}`
- **Description:** Removes the job permanently.
- **Response `200 OK`:** Confirmation message.

---

### 3.9. Health & Gateway Diagnostics
- **Endpoint:** `GET /actuator/health`
- **Response `200 OK`:**
  ```json
  { "status": "UP" }
  ```

---

## 4. UI / UX Design Guidelines & Components

### 4.1. Color Palette for Status Badges

#### Job Status Badges (`JobStatus`)

| Status               | Color (Tailwind)                                    | Visual Style          | Meaning                                    |
| :------------------- | :-------------------------------------------------- | :-------------------- | :----------------------------------------- |
| `SCHEDULED`          | `bg-slate-50 text-slate-700 border-slate-200`       | Dot indicator         | Waiting for the next scheduled trigger     |
| `RUNNING`            | `bg-blue-50 text-blue-700 border-blue-200`          | Pulsing dot animation | Currently running an execution             |
| `COMPLETED`          | `bg-emerald-50 text-emerald-700 border-emerald-200` | Checkmark icon        | One-time job finished successfully         |
| `PAUSED`             | `bg-amber-50 text-amber-700 border-amber-200`       | Pause icon            | Temporarily paused by operator             |
| `CANCELLED`          | `bg-slate-50 text-slate-500 border-slate-200`       | Slash icon            | Manually cancelled                         |
| `FAILED_PERMANENTLY` | `bg-rose-100 text-rose-800 border-rose-300`         | Alert triangle icon   | Maximum retries exhausted; job sent to DLQ |

#### Job Run Status Badges (`JobRunStatus`)

| Run Status      | Color (Tailwind)                                    | Visual Style           | Meaning                                      |
| :-------------- | :-------------------------------------------------- | :--------------------- | :------------------------------------------- |
| `PENDING`       | `bg-slate-50 text-slate-600 border-slate-200`       | Dot indicator          | Run is waiting in the messaging pipeline     |
| `QUEUED`        | `bg-indigo-50 text-indigo-700 border-indigo-200`    | Queue / hourglass icon | Dispatched and waiting for a worker slot     |
| `RUNNING`       | `bg-blue-50 text-blue-700 border-blue-200`          | Pulsing dot animation  | Worker is actively executing the run         |
| `SUCCESS`       | `bg-emerald-50 text-emerald-700 border-emerald-200` | Checkmark icon         | Execution completed successfully             |
| `FAILED`        | `bg-rose-50 text-rose-700 border-rose-200`          | Cross / alert icon     | Run failed; retry may be scheduled           |
| `TIMEOUT`       | `bg-amber-50 text-amber-700 border-amber-200`       | Clock alert icon       | Execution exceeded the maximum duration      |
| `CANCELLED`     | `bg-slate-50 text-slate-500 border-slate-200`       | Slash icon             | Run was cancelled before or during execution |
| `EXECUTOR_DIED` | `bg-rose-100 text-rose-800 border-rose-300`         | Warning / alert icon   | Worker crashed or its heartbeat was lost     |


### 4.2. Required Screens & Key Workflows

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  ZenSys DJSP      [ Jobs ]  [ Global Runs ]         [Status ▼]  [Type ▼]   [+ New Job] │
├───────────────────┬────────────────────────────────────────────────────────────────────┤
│ Metrics:          │ [ 12 Total Jobs ] [ 2 Running ] [ 1 Failed Run ] [ 99.2% Success ] │
├───────────────────┴────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│  Job Name       Type    Schedule / Cron    Status      Next Run     Last Run    Acts   │
│ ────────────────────────────────────────────────────────────────────────────────────── │
│  Daily Backup   CRON    0 0 12 * * ?      [SCHEDULED]  12:00 PM     [SUCCESS]   [⋮]    │
│  Data Sync      ONCE    2026-09-18 14:00  [RUNNING]    Now          [RUNNING]   [⋮]    │
│  Cleanup        CRON    0 0 * * * ?       [PAUSED]     --           [FAILED]    [⋮]    │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Screen 1: Dashboard & Job List (`/jobs`)
1. **Top Metric Cards:**
   - Total Jobs, Active / Running, Scheduled, Permanently Failed.
2. **Interactive Data Table:**
   - Columns: `Job Name`, `Schedule Type`, `Expression/Time`, `Status`, `Next Run Time`, `Retries`, `Actions`.
   - Copyable Job ID with tooltip (`01J8...` ➔ Click to copy).
   - Row Actions: **View Details / Runs**, **Edit**, **Pause / Resume**, **Delete**.
3. **Search & Filter Controls:**
   - Status Filter dropdown (`GET /jobs?status=...`).
   - Schedule Type Filter dropdown (`GET /jobs?scheduleType=...`).
   - Client-side quick filter by job name or ID.
   - Auto-refresh toggle (Polling every 10s or 15s using TanStack Query).

---

#### Screen 2: Create / Edit Job Modal (`/jobs/new` or Modal)
1. **Job Identity:**
   - `Name`: Text input with placeholder e.g. "Send Customer Digest".
2. **Schedule Configuration:**
   - Segmented Radio Buttons: `CRON` | `ONCE` | `INTERVAL`.
   - **If `CRON` selected:**
     - Cron Expression input: `0 0 12 * * ?`.
     - Human-readable translation below the input (e.g. *"Runs at 12:00 PM every day"*).
     - Preset pills: `"Every Hour"`, `"Every Day at Midnight"`, `"Weekly on Monday"`.
   - **If `ONCE` selected:**
     - Date & Time Picker (enforces future timestamp, converts to ISO-8601).
3. **Execution Payload:**
   - Interactive JSON Code Editor (Monaco Editor or CodeMirror) with formatting/prettify button and syntax validation error indicator.
4. **Resilience & Metadata:**
   - `Retries`: Number stepper (default `3`, range `0` to `10`).
   - `Meta / Tags`: JSON or key-value pair input.

---

#### Screen 3: Job Detail & Run History (`/jobs/:jobId`)
1. **Job Overview Section:**
   - Job ID, Status badge, Schedule Type, Next Run Time, Last Polled Time.
   - Formatted Payload & Meta blocks with copy-to-clipboard.
   - Quick action buttons: **Edit Job**, **Pause / Resume**, **Delete Job**.
2. **Execution History Table (Powered by `GET /jobs/:jobId/runs`):**
   - Columns: `Run ID`, `Status`, `Attempt #`, `Start Time`, `Duration`, `Executor`, `Actions`.
   - Formatted duration (e.g. `4.25s` or `120ms` based on `executionTimeMs`).
   - Clickable row / "View Log" button: Opens a slide-over drawer showing detailed run info (`GET /jobs/runs/:runId`) including the full error message / stack trace (`errorMsg`) for failed or timed out runs.

---

#### Screen 4: Global Runs & Failure Monitor (`/runs`)
- **Powered by:** `GET /jobs/runs?status=FAILED` (or without status for all runs).
- **Purpose:** System-wide live view of all job runs, allowing SREs and developers to monitor failing executions, investigate executor issues (`executorId`), and quickly navigate back to the parent job.

---

## 5. Recommended Frontend Tech Stack

- **Framework:** Next.js (App Router) or Vite + React / TypeScript.
- **Styling & UI Components:** Tailwind CSS + [shadcn/ui](https://ui.shadcn.com/) (Table, Dialog, Form, Badge, DropdownMenu, Sheet / Drawer).
- **Icons:** `lucide-react`.
- **Data Fetching & Caching:** `@tanstack/react-query` (handles automatic background refetching/polling every 10-15 seconds for live status and runs).
- **Cron Humanizer:** `cronstrue` (translates cron strings like `*/15 * * * *` into plain English).
- **Forms & Validation:** `react-hook-form` + `zod`.
- **Code/JSON Editor:** `@monaco-editor/react` or `@uiw/react-codemirror`.