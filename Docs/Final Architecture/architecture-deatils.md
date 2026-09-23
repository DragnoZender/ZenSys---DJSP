# ZenSys: Distributed Job Scheduling Platform (DJSP)
## Comprehensive Technical Architecture & System Design Documentation

---

## 1. Executive Summary & Architecture Overview

**ZenSys** is a high-performance, fault-tolerant, horizontally scalable Distributed Job Scheduling Platform designed to coordinate, dispatch, execute, and monitor asynchronous and scheduled workloads across distributed environments. 

The platform supports three distinct job execution paradigms:
1. **One-Time Jobs (`ONCE`)**: Executed at a specific timestamp or immediately upon creation.
2. **Cron-Based Recurring Jobs (`CRON`)**: Executed recurrently according to standard unix/quartz 6-field cron expressions with timezone awareness.
3. **Interval-Based Recurring Jobs (`INTERVAL`)**: Executed recurrently at fixed-second intervals relative to completion or scheduling timestamps.

### Foundational Architectural Principles

1. **Command Query Responsibility Segregation (CQRS)**:
   * **Write Path**: Handled exclusively by `job-service`, which acts as a lightweight, stateless command ingestion layer producing events to Kafka without holding any database connections.
   * **Read Path**: Handled exclusively by `job-search-service`, providing direct, read-only queries against PostgreSQL with optimized compound indexes.
   * **State Synchronization**: Handled asynchronously by `consumer-service`, maintaining database state and enforcing strict state machine transitions.

2. **Event-Driven Architecture (EDA)**:
   * Inter-service communication and task lifecycles are decoupled through **Apache Kafka**.
   * Exact event ordering is guaranteed at the partition level by using deterministic partition keys (`jobId` for job commands and dispatches; `runId` for execution lifecycle events).

3. **Database Polling & Lease Protocol (Pessimistic Locking with SKIP LOCKED)**:
   * `watcher-service` discovers due jobs using database-level pessimistic write locking with non-blocking skip locks (`SELECT ... FOR UPDATE SKIP LOCKED`).
   * Claiming a lease is decoupled from the network dispatch to ensure database transactions remain micro-duration (~10ms) and never hold locks during Kafka I/O.

4. **Project Loom Concurrency (Java 25 Virtual Threads)**:
   * `executor-service` executes worker tasks on lightweight Java Virtual Threads (`Executors.newVirtualThreadPerTaskExecutor()`), enabling high concurrent execution densities with minimal memory overhead and non-blocking I/O.

5. **Distributed Delay Queue via Redis Sorted Sets (ZSET)**:
   * `retry-service` manages exponential backoff retries without blocking threads or spinning Kafka consumers by scheduling delayed executions in Redis Sorted Sets, leased and swept atomically using Lua scripts.

6. **Dead Man's Switch & Zombie Sweeping**:
   * Worker instances continuously pulse heartbeats with automatic TTLs in Redis.
   * `watcher-service` runs a periodic zombie detection scanner that verifies the liveness of executors handling in-flight jobs. If an executor terminates abruptly without emitting a failure event, the Dead Man's Switch trips, and the orphan run is recovered.

7. **Multi-Layer Idempotency & Out-of-Order Transition Guards**:
   * `consumer-service` implements exact message deduplication via unique ULID event tracking tables and an out-of-order state machine matrix that prevents state regression from terminal outcomes.

---

## 2. Global System Topology & Service Inventory

The ZenSys backend consists of **9 decoupled microservices**, coordinated through a central service registry, an API gateway, a message broker, a relational database, and an in-memory coordination cache.

```
                           +------------------------+
                           |  Web / Client Ingress  |
                           +-----------+------------+
                                       |
                                       v
                           +------------------------+
                           |      api-gateway       | (Port 8080)
                           +-----+------------+-----+
                                 |            |
                GET /jobs/**     |            | POST,PUT,DELETE /jobs/**
                (Read Path)      |            | (Write Path)
                                 v            v
                 +-------------------+    +-------------------+
                 | job-search-service|    |    job-service    |
                 |    (Port 8083)    |    |    (Port 8081)    |
                 +---------+---------+    +---------+---------+
                           |                        |
                           | Reads                  | Emits JobCommand
                           v                        v
                    +--------------+      +-------------------+
                    |  PostgreSQL  |      |   Kafka Broker    |
                    |  (Supabase)  |      |  (localhost:9092) |
                    +-------+------+      +---------+---------+
                            ^                       ^
                            | Mutations             | Events & Dispatches
                            +-----------------------+
                            |
           +----------------+----------------+----------------+
           |                                 |                |
+----------+---------+              +--------+-------+  +-----+----------+
|  consumer-service  |              | watcher-service|  | retry-service  |
|    (Port 8082)     |              |  (Port 8084)   |  |  (Port 8087)   |
+--------------------+              +--------+-------+  +-----+----------+
                                             |                |
                                      Checks |         Leases |
                                   Heartbeat |      Due Items |
                                             v                v
                                    +--------------------------------+
                                    |     Redis Store (Upstash)      |
                                    +--------------------------------+
                                             ^
                                             | Pulses Heartbeat (TTL 30s)
                                             |
                                    +--------+-------+
                                    |executor-service| (Port 8086)
                                    +--------+-------+
                                             ^
                                             | Dispatches HTTP via OpenFeign
                                             |
                                 +-----------+----------+
                                 | job-consumer-service | (Port 8085)
                                 +----------------------+
```

### Microservice Summary Table

| Service | Port | Primary Responsibilities | Data Dependencies | Discovery Role |
| :--- | :--- | :--- | :--- | :--- |
| **`service-registry`** | 8761 | Eureka Service Discovery Server | In-memory | Eureka Registry Server |
| **`api-gateway`** | 8080 | Edge routing, CORS, reverse proxy, Actuator | Eureka Registry | Eureka Client |
| **`job-service`** | 8081 | Job creation/update/deletion, cron calculation | Kafka (`job-commands`) | Eureka Client |
| **`job-search-service`** | 8083 | CQRS Read queries for jobs and execution runs | PostgreSQL (Read-Only) | Eureka Client |
| **`consumer-service`** | 8082 | State persistence, idempotency, lifecycle management | PostgreSQL, Kafka | Standalone / Consumer |
| **`watcher-service`** | 8084 | Due job polling, cron progression, zombie detection | PostgreSQL, Redis, Kafka | Standalone / Scheduler |
| **`job-consumer-service`** | 8085 | Job dispatching, lifecycle init (`PENDING`), Feign client | Kafka, Eureka | Eureka Client |
| **`executor-service`** | 8086 | Virtual thread task execution, webhooks, heartbeats | Redis, Kafka | Eureka Client |
| **`retry-service`** | 8087 | Delay queue ingestion, Lua leasing, retry sweeper | Redis, Kafka | Standalone / Scheduler |

---

## 3. Deep-Dive Microservice Architecture

---

### 3.1. `service-registry` (Port 8761)
* **Main Class**: `ServiceRegistryApplication` annotated with `@EnableEurekaServer`.
* **Configuration**:
  * `eureka.client.register-with-eureka=false`: Prevents the registry server from registering with itself.
  * `eureka.client.fetch-registry=false`: Disables self-registry fetching.
* **Role**: Acts as the centralized registry for dynamic instance resolution across microservices (used by `api-gateway` and `job-consumer-service` for client-side load balancing via OpenFeign and Gateway MVC).

---

### 3.2. `api-gateway` (Port 8080)
* **Main Class**: `ApiGatewayApplication` running Spring Cloud Gateway MVC on Java 25.
* **Routing Rules**:
  * **Read Route (`job-search-read-route`)**:
    * Path: `/jobs/**`
    * Method: `GET`
    * Target URI: `lb://job-search-service`
  * **Write Route (`job-write-route`)**:
    * Path: `/jobs/**`
    * Methods: `POST`, `PUT`, `DELETE`
    * Target URI: `lb://job-service`
* **Operational Configuration**:
  * **CORS**: Globally permits origins `http://localhost:5173` and `http://localhost:3000` with methods `GET, POST, PUT, DELETE, OPTIONS`, full header forwarding, and credentials enabled.
  * **Actuator**: Health, info, and gateway management endpoints exposed at `/actuator/*`.

---

### 3.3. `job-service` (Port 8081) — *Command Ingestion (Write Side)*
* **Controllers**:
  * `JobController`:
    * `POST /jobs/create` $\rightarrow$ Accepts `CreateJobRequest`.
    * `PUT /jobs/update/{jobId}` $\rightarrow$ Accepts `UpdateJobRequest`.
    * `DELETE /jobs/delete/{jobId}` $\rightarrow$ Accepts path parameter `jobId`.
* **Core Logic (`JobService`)**:
  * **Monotonic Identifier Generation**: Uses `UlidCreator.getUlid()` to generate Universally Unique Lexicographically Sortable Identifiers for `jobId` and `eventId`.
  * **Initial `nextRunTime` Calculation**:
    * `ONCE`: Sets `nextRunTime = scheduleTime != null ? scheduleTime : Instant.now()`.
    * `CRON`: Parses standard 5-part cron expressions (auto-prepending `"0 "` for 6-field Spring `CronExpression` format). Resolves the target timezone from the `meta` JSON field (defaults to `Asia/Kolkata`) and calculates `cron.next(ZonedDateTime.now(zoneId)).toInstant()`.
    * `INTERVAL`: Parses `intervalSeconds` or `interval` from `meta` JSON (defaults to 60s) and calculates `Instant.now().plusSeconds(intervalSeconds)`.
* **Kafka Dispatch (`JobProducer`)**:
  * Packages command payload into `JobCommand`.
  * Publishes to Kafka topic `job-commands` using `jobId` as the record partition key. This guarantees that all state alterations for a specific job arrive in sequential order on the same Kafka partition.

---

### 3.4. `job-search-service` (Port 8083) — *Query Ingestion (Read Side)*
* **Controllers**:
  * `JobSearchController`:
    * `GET /jobs/{jobId}`: Retrieves job definition by primary ID.
    * `GET /jobs?status=...&scheduleType=...`: Filtered list of jobs by status and schedule type.
    * `GET /jobs/{jobId}/runs`: Retrieves execution history for a job ordered chronologically descending (`startTime DESC`).
    * `GET /jobs/runs/{runId}`: Retrieves single execution run metadata by run ULID.
    * `GET /jobs/runs?status=...`: Retrieves all runs matching a lifecycle status.
* **Database Access**:
  * Connects directly to PostgreSQL (Supabase) via Spring Data JPA.
  * Configured with `spring.jpa.hibernate.ddl-auto=validate` to prevent any DDL modifications or schema locks from the query tier.

---

### 3.5. `consumer-service` (Port 8082) — *State Management & Lifecycle Engine*
* **Responsibilities**: Sole service authorized to mutate the relational state of `jobs` and `job_runs` in PostgreSQL.
* **Kafka Ingestion Layers**:
  1. **Topic `job-commands` (`job-consumer-group`)**:
     * Handled by `JobConsumer` $\rightarrow$ `JobPersistenceService`.
     * **Idempotency**: Checks existence in table `processed_commands` by `eventId`. If already processed, the record is discarded immediately.
     * **Mutations**:
       * `CREATE`: Maps command fields to `Job` entity, sets initial `status = SCHEDULED`, and saves.
       * `UPDATE`: Finds `Job` by `jobId`, updates mutable properties (`name`, `scheduleType`, `status`, `scheduleTime`, `nextRunTime`, `cronExpression`, `payload`, `retries`, `meta`), and saves.
       * `DELETE`: Deletes job row by `jobId` (cascading to `job_runs`).
     * Records `eventId` and `processedAt` in `processed_commands`.
  2. **Topic `job-run-events` (`job-run-events-consumer-group`)**:
     * Handled by `JobRunEventConsumer` $\rightarrow$ `JobRunPersistenceService`.
     * **Layer 1 Idempotency (Deduplication)**: Evaluates `processed_events` table for `eventId`.
     * **Layer 2 Idempotency (State Machine Guard)**:
       * Guard Rule A: If `JobRun` is already in a terminal state (`SUCCESS`, `FAILED`, `TIMEOUT`, `CANCELLED`, `EXECUTOR_DIED`), incoming non-terminal events (`PENDING`, `RUNNING`) are dropped to protect against out-of-order network arrival.
       * Guard Rule B: If `JobRun` is currently `RUNNING`, late or duplicate `PENDING` packets are dropped.
     * **State Transitions**:
       * `PENDING`: Creates new `JobRun` record in database with `attemptNumber` and `modificationTime`.
       * `RUNNING`: Sets `startTime`, assigns `executorId`, transitions parent `Job` status to `RUNNING`.
       * `SUCCESS`: Sets `endTime`, `executionTimeMs`. Updates parent job: if `ONCE`, transitions job to `COMPLETED`; if `CRON` or `INTERVAL`, resets job to `SCHEDULED`.
       * `FAILED` / `TIMEOUT` / `EXECUTOR_DIED`: Records failure state, execution duration, and `errorMsg`. Leaves parent job status as `RUNNING` while retries are in-flight to avoid false status flapping.
  3. **Topic `dead` (`job-dead-consumer-group`)**:
     * Consumes `JobDeadEvent` emitted when max retries are exhausted.
     * Updates parent job:
       * If `ScheduleType.ONCE`: Transitions job to `FAILED_PERMANENTLY`.
       * If `ScheduleType.CRON` or `INTERVAL`: Resets job to `SCHEDULED` so future scheduled intervals can still trigger.
     * Synchronizes the corresponding `JobRun` record status to terminal `FAILED`.

---

### 3.6. `watcher-service` (Port 8084) — *Scheduler, Poller & Dead Man's Switch*
* **Engine 1: Due Job Polling & Dispatcher**:
  * **Trigger**: `@Scheduled(fixedDelayString = "${watcher.polling.interval-ms:20000}")` in `WatcherScheduler`.
  * **Database Locking Strategy**:
    * Executes `JobRepository.findDueJobs()`:
      ```sql
      SELECT j FROM Job j
      WHERE j.status IN ('SCHEDULED', 'RUNNING')
        AND j.nextRunTime <= :now
        AND (j.lastPolledTime IS NULL OR j.lastPolledTime < :threshold)
      ORDER BY j.nextRunTime ASC
      ```
    * Configured with `@Lock(LockModeType.PESSIMISTIC_WRITE)` and `@QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2")`. In PostgreSQL, this issues `SELECT ... FOR UPDATE SKIP LOCKED`.
    * **Lease Acquisition**: Updates `lastPolledTime = now` in a short, dedicated database transaction (~10ms). Multiple distributed watcher instances can poll simultaneously without lock contention or duplicate claims.
  * **Decoupled Kafka Dispatch**:
    * Iterates through claimed jobs and constructs `JobRunEvent` (with a newly generated ULID `runId` and `attempt = 1`).
    * Publishes synchronously to Kafka topic `run` via `RunProducer`.
  * **Schedule Progression**:
    * Executes an isolated micro-transaction via `JobTransactionService.advanceAndSaveJob`:
      * `ONCE`: Sets `status = RUNNING`, clears `nextRunTime = null`.
      * `CRON`: Calculates the next occurrence time from the cron expression and updates `nextRunTime`.
      * `INTERVAL`: Increments `nextRunTime = now + intervalSeconds`.
  * **Lease Recovery**: If Kafka dispatch fails, catches the exception and immediately invokes `releaseJobLease(jobId)` (`UPDATE Job SET lastPolledTime = null`) so other pollers or future iterations do not have to wait for the threshold timeout.

* **Engine 2: Zombie Sweeper & Dead Man's Switch**:
  * **Trigger**: `@Scheduled(fixedDelayString = "${watcher.zombie-sweeper.interval-ms:20000}")` in `ExecutorLivenessWatcher`.
  * **Detection**: Queries `JobRunRepository.findStaleRunningRuns()` for runs with `status = RUNNING` and `modificationTime < (now - 60s)`.
  * **Dead Man's Switch Verification**:
    * Checks Redis key `executor:{executorId}:heartbeat`.
    * If key exists, the executor is alive and the job is healthy.
    * If key is absent, the executor died mid-execution.
  * **Recovery Sequence**:
    1. Acquires a multi-watcher distributed recovery lock in Redis: `SET lock:recover:{runId} 1 EX 120 NX`. If false, another watcher is already recovering this run.
    2. Inspects `attemptNumber` and `maxRetries`:
       * If `attempt < maxRetries`: Computes exponential backoff $10 \times 2^{\text{attempt}}$ seconds, creates `JobRetryEvent`, and publishes to Kafka topic `retry`.
       * If `attempt >= maxRetries`: Creates `JobDeadEvent` and publishes to Kafka topic `dead`.
    3. Dispatches `JobRunLifecycleEvent(status = EXECUTOR_DIED)` to Kafka topic `job-run-events` to ensure the failure is persisted to PostgreSQL.

---

### 3.7. `job-consumer-service` (Port 8085) — *Dispatcher & OpenFeign Client*
* **Kafka Listener**: `JobRunConsumer` listens on topic `run` (`job-dispatch-consumer-group`).
* **Lifecycle Initialization**:
  * Immediately constructs a `JobRunLifecycleEvent` with `status = PENDING` and a new ULID `eventId`.
  * Publishes event to Kafka topic `job-run-events` keyed by `runId`.
* **Execution Dispatch**:
  * Translates `JobRunMessage` into `JobExecutionRequest`.
  * Invokes `ExecutorClient` (`@FeignClient(name = "executor-service")`) via HTTP `POST /executor/run`.

---

### 3.8. `executor-service` (Port 8086) — *Worker Node & Virtual Threads*
* **HTTP Ingress**: `ExecutorController.runJob()` receives dispatch requests and returns `HTTP 202 Accepted` immediately, decoupling dispatch ingestion from task execution.
* **Worker Pool Architecture**:
  * Initialized in `JobExecutionService` via `Executors.newVirtualThreadPerTaskExecutor()`.
  * Every job runs on an isolated Java 25 Virtual Thread.
* **Execution Lifecycle**:
  1. Emits `JobRunLifecycleEvent(status = RUNNING)` with `executorId` to Kafka topic `job-run-events`.
  2. Resolves execution timeout: inspects `payload` for `timeoutSeconds`; if unspecified, falls back to `executor.default-timeout-seconds` (60s).
  3. Executes `CompletableFuture.runAsync(() -> taskRunner.execute(request), workerPool).orTimeout(timeoutSeconds, TimeUnit.SECONDS)`.
* **Task Runner Implementations (`TaskRunner`)**:
  * **HTTP Webhook Task**: If payload contains `"url"`, executes an external HTTP call via Spring `RestClient` with specified method (`POST`, `GET`, etc.) and JSON body.
  * **Simulated Task**: If payload contains `"durationMs"`, simulates execution latency (`Thread.sleep()`) and triggers deliberate failure if `"fail": true` (used for stress and benchmark validation).
  * **Generic Task**: Handles plain-text or empty payloads.
* **Outcomes & Error Routing**:
  * **Success**: Publishes `SUCCESS` lifecycle event with `executionTimeMs`.
  * **Timeout**: Publishes `TIMEOUT` lifecycle event and triggers `handleRetryOrDead`.
  * **Failure**: Publishes `FAILED` lifecycle event with root-cause error and triggers `handleRetryOrDead`.
  * **Retry / Dead Evaluation**:
    * If `attempt < maxRetries`: Calculates backoff delay ($10 \times 2^{\text{attempt}}$ seconds) and publishes `JobRetryEvent` to Kafka topic `retry`.
    * If `attempt >= maxRetries`: Publishes `JobDeadEvent` to Kafka topic `dead`.
* **Heartbeat Mechanism**:
  * `ExecutorHeartbeatService` runs every 10 seconds:
    `SET executor:{executorId}:heartbeat <timestamp> EX 30`.
  * Provides the Dead Man's Switch signal monitored by `watcher-service`.

---

### 3.9. `retry-service` (Port 8087) — *Redis Delay Queue & Sweeper*
* **Delay Queue Ingestion**:
  * `RetryEventConsumer` listens on Kafka topic `retry` (`retry-service-group`).
  * Calculates `dueTimestampMs = System.currentTimeMillis() + (delaySeconds * 1000)`.
  * Executes an atomic Redis Lua script (`ATOMIC_INGEST_LUA`):
    ```lua
    local dedup_key = KEYS[1]
    local zset_key = KEYS[2]
    local dedup_ttl = tonumber(ARGV[1])
    local due_timestamp = tonumber(ARGV[2])
    local item_json = ARGV[3]

    local set_result = redis.call('SET', dedup_key, '1', 'EX', dedup_ttl, 'NX')
    if not set_result then
        return 0
    end

    redis.call('ZADD', zset_key, due_timestamp, item_json)
    return 1
    ```
  * Deduplication key `retry:dedup:{jobId}:{attempt}` ensures that retried events are buffered exactly once.
* **Retry Sweeper Engine**:
  * `RetrySweeperService` triggers every 1000ms.
  * Executes atomic Lua leasing script (`ATOMIC_LEASE_LUA`):
    ```lua
    local zset_key = KEYS[1]
    local now = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local lease_ms = tonumber(ARGV[3])
    local items = redis.call('ZRANGEBYSCORE', zset_key, '-inf', now, 'LIMIT', 0, limit)
    if #items > 0 then
        for i, item in ipairs(items) do
            redis.call('ZADD', zset_key, now + lease_ms, item)
        end
    end
    return items
    ```
  * Pushing the score forward by 30 seconds (`lease_ms`) acts as an in-memory lease preventing concurrent sweepers from claiming the same items.
  * For each due item, generates a new ULID `newRunId` and publishes `JobRunMessage` to Kafka topic `run`.
  * **At-Least-Once Delivery**: The item is only removed from the Redis ZSET (`ZREM`) after receiving a synchronous delivery acknowledgment from the Kafka broker. If publishing fails, the lease expires and the item is re-swept automatically.

---

## 4. Message Broker (Kafka) Event Matrix

All messages in Kafka are serialized using `org.springframework.kafka.support.serializer.JsonSerializer` and deserialized using `org.springframework.kafka.support.serializer.JacksonJsonDeserializer`.

```
+---------------------------------------------------------------------------------------------------------------+
|                                            KAFKA EVENT FLOW MATRIX                                            |
+-------------------+-----------------+-----------------------+---------------------+---------------------------+
| Topic Name        | Partition Key   | Payload DTO           | Producer(s)         | Consumer Group(s)         |
+-------------------+-----------------+-----------------------+---------------------+---------------------------+
| job-commands      | jobId           | JobCommand            | job-service         | job-consumer-group        |
| run               | jobId           | JobRunEvent /         | watcher-service,    | job-dispatch-consumer-grp |
|                   |                 | JobRunMessage         | retry-service       |                           |
| job-run-events    | runId           | JobRunLifecycleEvent  | job-consumer-serv,  | job-run-events-consumer-g |
|                   |                 |                       | executor-service,   |                           |
|                   |                 |                       | watcher-service     |                           |
| retry             | jobId           | JobRetryEvent         | executor-service,   | retry-service-group       |
|                   |                 |                       | watcher-service     |                           |
| dead              | jobId           | JobDeadEvent          | executor-service,   | job-dead-consumer-group   |
|                   |                 |                       | watcher-service     |                           |
+-------------------+-----------------+-----------------------+---------------------+---------------------------+
```

### Event Payload Definitions

1. **`JobCommand`**:
   * Fields: `type` (`CREATE`, `UPDATE`, `DELETE`), `eventId`, `jobId`, `name`, `scheduleType`, `status`, `scheduleTime`, `cronExpression`, `payload`, `retries`, `meta`, `nextRunTime`, `lastPolledTime`.
2. **`JobRunEvent` / `JobRunMessage`**:
   * Fields: `runId`, `jobId`, `payload`, `attempt`, `scheduledAt`, `maxRetries`.
3. **`JobRunLifecycleEvent`**:
   * Fields: `eventId`, `runId`, `jobId`, `status` (`PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, `TIMEOUT`, `EXECUTOR_DIED`), `attempt`, `executorId`, `executionTimeMs`, `errorMsg`, `timestamp`, `scheduledAt`.
4. **`JobRetryEvent`**:
   * Fields: `jobId`, `runId`, `payload`, `attempt`, `maxRetries`, `retryDelaySeconds`, `errorMsg`, `timestamp`.
5. **`JobDeadEvent`**:
   * Fields: `jobId`, `runId`, `payload`, `attempt`, `maxRetries`, `errorMsg`, `timestamp`.

---

## 5. Persistence & In-Memory Data Models

---

### 5.1. Relational Database Schema (PostgreSQL / Supabase)

#### Table 1: `jobs`
Stores core job definitions, scheduling parameters, and current status.
```sql
CREATE TABLE jobs (
    id VARCHAR(26) PRIMARY KEY,              -- ULID
    name VARCHAR(255) NOT NULL,
    schedule_type VARCHAR(50) NOT NULL,       -- ONCE, CRON, INTERVAL
    status VARCHAR(50) NOT NULL,              -- SCHEDULED, RUNNING, PAUSED, CANCELLED, COMPLETED, FAILED_PERMANENTLY
    schedule_time TIMESTAMP WITH TIME ZONE,
    next_run_time TIMESTAMP WITH TIME ZONE,
    last_polled_time TIMESTAMP WITH TIME ZONE,
    cron_expression VARCHAR(255),
    payload JSONB,
    retries INTEGER NOT NULL DEFAULT 3,
    meta JSONB
);

-- Compound Index for Watcher Polling
CREATE INDEX idx_watcher_poll ON jobs (next_run_time, status, last_polled_time);
CREATE INDEX idx_schedule_time ON jobs (schedule_time);
```

#### Table 2: `job_runs`
Maintains immutable execution run records, attempt numbers, and timing metrics.
```sql
CREATE TABLE job_runs (
    id BIGSERIAL PRIMARY KEY,
    run_id VARCHAR(26) UNIQUE NOT NULL,      -- ULID
    job_id VARCHAR(26) NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,              -- PENDING, QUEUED, RUNNING, SUCCESS, FAILED, TIMEOUT, CANCELLED, EXECUTOR_DIED
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    modification_time TIMESTAMP WITH TIME ZONE NOT NULL,
    executor_id VARCHAR(255),
    attempt_number INTEGER NOT NULL DEFAULT 1,
    execution_time_ms BIGINT,
    error_msg TEXT
);

CREATE INDEX idx_job_id ON job_runs (job_id);
CREATE INDEX idx_status ON job_runs (status);
CREATE INDEX idx_run_id ON job_runs (run_id);
CREATE INDEX idx_modification_time ON job_runs (modification_time);
CREATE INDEX idx_status_modification_time ON job_runs (status, modification_time);
```

#### Table 3: `processed_commands`
Primary key table for idempotency tracking of `JobCommand` ingestion.
```sql
CREATE TABLE processed_commands (
    event_id VARCHAR(255) PRIMARY KEY,       -- ULID
    processed_at TIMESTAMP NOT NULL
);
```

#### Table 4: `processed_events`
Primary key table for idempotency tracking of `JobRunLifecycleEvent` ingestion.
```sql
CREATE TABLE processed_events (
    event_id VARCHAR(255) PRIMARY KEY,       -- ULID
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL
);
```

---

### 5.2. In-Memory Data Structures (Redis / Upstash)

| Key Pattern | Data Structure | TTL | Purpose |
| :--- | :--- | :--- | :--- |
| `executor:{id}:heartbeat` | String (`Instant`) | 30 seconds | Dead Man's Switch liveness indicator set by `executor-service`. |
| `lock:recover:{runId}` | String (`"1"`) | 2 minutes | Distributed lock preventing duplicate recovery of an orphaned run. |
| `retry:delayed` | Sorted Set (ZSET) | None (Persistent) | Delay queue scored by `dueTimestampMs`. Member is `DelayedRetryItem` JSON. |
| `retry:dedup:{jobId}:{attempt}` | String (`"1"`) | $\max(600\text{s}, \text{delay} + 300\text{s})$ | Ingestion deduplication flag preventing duplicate retries in Redis. |

---

## 6. End-to-End Operational Workflows

---

### Workflow A: Job Creation & Scheduling (Write Path)
```
[Client] 
   | HTTP POST /jobs/create
   v
[api-gateway (8080)]
   | Routes to lb://job-service
   v
[job-service (8081)]
   | 1. Generates ULIDs: jobId, eventId
   | 2. Computes initial nextRunTime (CRON / INTERVAL / ONCE)
   | 3. Emits JobCommand to Kafka 'job-commands' (Key = jobId)
   v
[Kafka: job-commands]
   | Consumed by job-consumer-group
   v
[consumer-service (8082)]
   | 1. Checks processed_commands for eventId (Idempotency)
   | 2. Saves Job entity to PostgreSQL (status = SCHEDULED)
   | 3. Inserts eventId into processed_commands
```

---

### Workflow B: Due Job Polling, Leasing & Dispatch
```
[watcher-service (8084)]
   | Triggers every 20s (@Scheduled)
   | 1. Executes findDueJobs() with FOR UPDATE SKIP LOCKED
   | 2. Sets lastPolledTime = now (10ms DB Transaction)
   | 3. Generates runId (ULID), emits JobRunEvent to Kafka 'run'
   | 4. Advances nextRunTime in isolated micro-transaction
   v
[Kafka: run]
   | Consumed by job-dispatch-consumer-group
   v
[job-consumer-service (8085)]
   | 1. Emits JobRunLifecycleEvent(PENDING) to 'job-run-events'
   | 2. Dispatches HTTP POST /executor/run via OpenFeign
   v
[executor-service (8086)]
   | Returns HTTP 202 Accepted immediately
   | Emits JobRunLifecycleEvent(RUNNING) to 'job-run-events'
   | Submits task to Java Virtual Thread Pool
```

---

### Workflow C: Task Execution, Timeout & Webhook Processing
```
[executor-service (8086) - Virtual Thread]
   | Runs TaskRunner.execute()
   | Enforces hard timeout: .orTimeout(timeoutSeconds)
   |
   +---> [If HTTP Webhook Task]: Executes RestClient call to external URL
   |
   +---> [If Task Succeeds]:
   |        Publishes SUCCESS lifecycle event to 'job-run-events'
   |
   +---> [If Task Fails or Times Out]:
            1. Publishes FAILED or TIMEOUT to 'job-run-events'
            2. If attempt < maxRetries:
                  Emits JobRetryEvent to Kafka 'retry' (delay = 10s * 2^attempt)
               Else:
                  Emits JobDeadEvent to Kafka 'dead'
```

---

### Workflow D: Exponential Backoff & Redis Delay Queue
```
[Kafka: retry]
   | Consumed by retry-service-group
   v
[retry-service (8087) - RetryEventConsumer]
   | Executes atomic Lua script:
   |   - Sets dedup flag retry:dedup:{jobId}:{attempt}
   |   - ZADD to Redis 'retry:delayed' with score = now + delaySeconds
   |
   v (Time passes until score <= now)
[retry-service (8087) - RetrySweeperService]
   | Runs every 1000ms (@Scheduled)
   | Executes atomic Lua lease script:
   |   - Claims due items and advances scores by +30s lease
   | Publishes JobRunMessage to Kafka 'run' (attempt = attempt + 1)
   | On Kafka ACK -> Removes item from Redis ZSET (ZREM)
```

---

### Workflow E: Executor Crash & Zombie Sweeper Recovery
```
[executor-service dies ungracefully]
   | Heartbeat key executor:{id}:heartbeat in Redis expires (TTL 30s)
   |
   v
[watcher-service (8084) - ExecutorLivenessWatcher]
   | Runs every 20s (@Scheduled)
   | 1. Finds runs with status=RUNNING and modificationTime < (now - 60s)
   | 2. Verifies Redis heartbeat: key missing! (Dead Man's Switch tripped)
   | 3. Acquires distributed lock: lock:recover:{runId} in Redis
   | 4. If attempt < maxRetries:
   |       Publishes JobRetryEvent to Kafka 'retry'
   |    Else:
   |       Publishes JobDeadEvent to Kafka 'dead'
   | 5. Emits EXECUTOR_DIED event to 'job-run-events'
   v
[consumer-service (8082)]
   | Records EXECUTOR_DIED on job_runs row in PostgreSQL
```

---

## 7. State Machine & Idempotency Rules

### 7.1. `JobRun` State Machine Matrix

```
       +--------------+
       |   (Init)     |
       +-------+------+
               |
               v
         [ PENDING ] ----------------------+
               |                           |
               v                           |
         [ RUNNING ] --------------------+ |
          |   |   |                      | |
          |   |   +-------------------+  | |
          |   v                       |  | |
          | [ SUCCESS ] (Terminal)    |  | |
          v                           |  | |
        [ FAILED ] (Terminal) <-------+--+ |
          |                           |    |
          v                           |    |
        [ TIMEOUT ] (Terminal) <------+----+
          |
          v
        [ EXECUTOR_DIED ] (Terminal)
```

#### State Transition Guard Rules
1. **Terminal Immutability**: If a `JobRun` is in any terminal status (`SUCCESS`, `FAILED`, `TIMEOUT`, `CANCELLED`, `EXECUTOR_DIED`), no incoming event can alter its status. Any out-of-order `PENDING` or `RUNNING` event is ignored and logged.
2. **Forward Progress Enforcement**: If a `JobRun` is currently `RUNNING`, late-arriving `PENDING` packets are ignored.
3. **Out-of-Order Fast Path**: If an execution completes so quickly that `SUCCESS` or `FAILED` arrives before `PENDING`, `JobRunPersistenceService` creates the `JobRun` directly in the terminal state.

---

### 7.2. Parent `Job` Status Lifecycle
* **`SCHEDULED`**: Job is waiting for its `nextRunTime` to arrive.
* **`RUNNING`**: At least one active execution run is currently in progress.
* **`COMPLETED`**: Applicable only to `ScheduleType.ONCE` jobs when a run finishes with `SUCCESS`.
* **`FAILED_PERMANENTLY`**: Applicable only to `ScheduleType.ONCE` jobs when all retry attempts have failed (`JobDeadEvent`).
* **Resilient Recurring Policy**: For recurring jobs (`CRON`, `INTERVAL`), whenever a run completes with `SUCCESS` or permanently exhausts retries with `JobDeadEvent`, the parent `Job` status is reset to `SCHEDULED` so future scheduled intervals continue executing unimpeded.

---

## 8. Technology Stack & Configuration Reference

* **Language**: Java 25
* **Framework**: Spring Boot 4.1.0, Spring Cloud 2025.1.2
* **Service Discovery**: Spring Cloud Netflix Eureka Server / Client
* **API Gateway**: Spring Cloud Gateway MVC
* **Inter-Service Communication**: OpenFeign, Spring `RestClient`, Apache Kafka
* **Message Serialization**: Jackson JSON (`JavaTimeModule` enabled)
* **Identifier Format**: ULID (26-character Crockford Base32 strings via `com.github.f4b6a3:ulid-creator:5.2.3`)
* **Persistence**: Spring Data JPA, Hibernate, PostgreSQL Driver
* **Caching & Distributed Coordination**: Spring Data Redis, Lettuce / Jedis, Redis Lua scripts
* **Task Concurrency**: Java Virtual Threads (`Executors.newVirtualThreadPerTaskExecutor()`)
* **Cloud Infrastructure Targets**:
  * PostgreSQL: Supabase Managed Cloud DB
  * Redis: Upstash Serverless Redis Cloud
  * Message Broker: Apache Kafka (9092)

---
*End of Architectural Documentation for ZenSys Distributed Job Scheduling Platform.*
