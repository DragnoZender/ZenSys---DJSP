Viewed Desgin-Doc.txt:61-140

# Frontend Specification & API Integration Document
**Project:** ZenSys Distributed Job Scheduling Platform (ZenSys DJSP)  
**Target Audience:** Frontend Engineers / UI Developers  
**Base Gateway URL:** `http://localhost:8080` (or `VITE_API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL`)

---

## 1. System Overview

ZenSys DJSP is an enterprise distributed job scheduling platform (similar to Airflow/Temporal/Quartz).
The frontend acts as an **Operations Dashboard** where engineers can:
- View all scheduled, running, paused, and completed jobs.
- Inspect real-time status and execution timestamps.
- Create new jobs (One-time, Cron-scheduled, or Interval-based).
- Update job configurations (schedules, payloads, retry limits).
- Delete or cancel scheduled jobs.

### Architecture Note for Frontend
All API requests must go through the **API Gateway** on port **`8080`**. The Gateway handles intelligent internal routing:
- **Read Operations (`GET`)** ➔ Routed to `job-search-service`
- **Write Operations (`POST`, `PUT`, `DELETE`)** ➔ Routed to `job-service`

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

### 3.1. List All Jobs
- **Endpoint:** `GET /jobs`
- **Description:** Returns all registered jobs in the system.
- **Query Params (Planned / Future):** `?status=RUNNING&search=keyword`
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

### 3.3. Create New Job
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
  *(Returns the newly generated `jobId` as string or confirmation message)*

---

### 3.4. Update Existing Job
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

### 3.5. Delete Job
- **Endpoint:** `DELETE /jobs/delete/{jobId}`
- **Description:** Removes the job permanently.
- **Response `200 OK`:** Confirmation message.

---

### 3.6. Health & Gateway Diagnostics
- **Endpoint:** `GET /actuator/health`
- **Response `200 OK`:**
  ```json
  { "status": "UP" }
  ```

---

## 4. UI / UX Design Guidelines & Components

### 4.1. Color Palette for Status Badges
Status indicators must clearly communicate operational health at a glance:

| Status | Color (Tailwind) | Visual Style | Meaning |
| :--- | :--- | :--- | :--- |
| `SCHEDULED` | `bg-blue-50 text-blue-700 border-blue-200` | Solid badge | Waiting for next scheduled trigger |
| `RUNNING` | `bg-amber-50 text-amber-700 border-amber-200` | Pulsing dot animation | Currently being executed by worker |
| `COMPLETED` | `bg-emerald-50 text-emerald-700 border-emerald-200` | Checkmark icon | Finished successfully |
| `PAUSED` | `bg-zinc-100 text-zinc-700 border-zinc-300` | Pause icon | Paused by user |
| `CANCELLED` | `bg-slate-100 text-slate-600 border-slate-300` | Slash icon | Manually cancelled |
| `FAILED_PERMANENTLY`| `bg-rose-50 text-rose-700 border-rose-200` | Alert triangle icon | Max retries exceeded, sent to DLQ |

---

### 4.2. Required Screens & Key Workflows

```
┌────────────────────────────────────────────────────────────────────────┐
│  ZenSys DJSP              [Search jobs...]   [Status ▼]   [+ New Job]  │
├──────────────┬─────────────────────────────────────────────────────────┤
│ Stats:       │ [ 12 Total ] [ 3 Running ] [ 7 Scheduled ] [ 1 Failed ] │
├──────────────┴─────────────────────────────────────────────────────────┤
│                                                                        │
│  Job Name       Type    Schedule / Cron    Status      Next Run  Acts  │
│ ────────────────────────────────────────────────────────────────────── │
│  Daily Backup   CRON    0 0 12 * * ?      [SCHEDULED]  12:00 PM  [⋮]   │
│  Data Sync      ONCE    2026-09-18 14:00  [RUNNING]    Now       [⋮]   │
│  Cleanup        CRON    0 0 * * * ?       [PAUSED]     --        [⋮]   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

#### Screen 1: Dashboard & Job List (`/jobs`)
1. **Top Metric Cards:**
   - Total Jobs, Active / Running, Scheduled, Failed / Alerting.
2. **Interactive Data Table:**
   - Columns: `Job Name`, `Schedule Type`, `Expression/Time`, `Status`, `Next Run`, `Retries`, `Actions`.
   - Copyable Job ID with tooltip (`01J8...` ➔ Click to copy).
   - Row Actions: **View Details**, **Edit**, **Pause / Resume**, **Delete**.
3. **Search & Filter Controls:**
   - Search bar (filters client-side or server-side by job name or ID).
   - Filter dropdowns: Status and Schedule Type (`CRON`, `ONCE`, `INTERVAL`).
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

#### Screen 3: Job Detail & Run Drawer (`/jobs/:jobId`)
- View full payload formatted with copy-to-clipboard.
- Timestamps: Created At, Scheduled Time, Next Run Time, Last Polled Time.
- Quick action buttons: **Edit Job**, **Trigger Run Now** (future), **Delete Job**.

---

## 5. Recommended Frontend Tech Stack

- **Framework:** Next.js (App Router) or Vite + React / TypeScript.
- **Styling & UI Components:** Tailwind CSS + [shadcn/ui](https://ui.shadcn.com/) (Table, Dialog, Form, Badge, DropdownMenu).
- **Icons:** `lucide-react`.
- **Data Fetching & Caching:** `@tanstack/react-query` (handles automatic background refetching/polling every 10-15 seconds).
- **Cron Humanizer:** `cronstrue` (translates cron strings like `*/15 * * * *` into plain English).
- **Forms & Validation:** `react-hook-form` + `zod`.
- **Code/JSON Editor:** `@monaco-editor/react` or `@uiw/react-codemirror`.

---