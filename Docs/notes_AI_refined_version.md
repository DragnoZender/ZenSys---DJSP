# Q) Why are there two tables: `Job` and `Job_Runs`?**

The `Job` table stores the **definition** of the work that needs to be performed. It contains the job's configuration, such as its schedule, execution type, retry policy, and other metadata. Each job is created only once.

The `Job_Runs` table stores the **actual execution instances** of a job. Every time a job is triggered—whether by its schedule, a manual execution, or a retry—a new record is created in `Job_Runs`. This allows a single job to have multiple execution instances, each with its own status, timestamps, logs, retry count, and execution result.

Separating these tables provides a clear distinction between the **job definition** and its **execution history**, making it easier to track past runs, monitor failures, handle retries, and maintain a complete audit trail.




# Q) What happens if a job fails during execution?

### Solution: Retry Mechanism

If a job fails while executing on an executor, it should be retried.

Unlike the Watcher Service, which publishes jobs to the **`run`** Kafka topic, the Executor publishes failed jobs to a dedicated **`retry`** topic.

The flow is as follows:

1. Executor fails to execute the job.
2. Executor publishes the job to the **`retry`** topic.
3. `Job_Consumer_Service` consumes the retry event.
4. It increments the **attempt_number** of the corresponding **Job_Run** (or Job, depending on your schema).
5. The updated attempt count is persisted back to the database.
6. The job is scheduled for another execution.

This approach provides complete visibility into how many execution attempts have been made for a job.

### Preventing Infinite Retry Loops

A job should not be retried indefinitely.

Before publishing a failed job back to the `retry` topic, the Executor compares:

```
attempt_number
vs
max_retries (configured by the user)
```

If:

```
attempt_number <= max_retries
```

→ Publish to **retry** topic.

Otherwise:

→ Publish to the **dead** topic (Dead Letter Queue).

The Dead Letter Queue stores permanently failed jobs for later inspection, debugging, or manual reprocessing.

---

# Q) How is the case handled when an Executor itself goes down?

The Watcher Service is responsible for detecting abandoned job executions.

Besides fetching scheduled jobs, it periodically queries the `Job_Runs` table for entries where:

* `status = RUNNING`
* `last_modified < current_time - 10 seconds`

Normally, every Executor sends periodic heartbeat updates by updating the `last_modified` timestamp of the running job.

If an Executor crashes:

* it can no longer update the heartbeat
* therefore `last_modified` becomes stale

The Watcher interprets this as an abandoned execution.

The recovery flow is:

1. Watcher detects stale RUNNING jobs.
2. Watcher marks the previous execution as failed (if required).
3. Watcher republishes the job to the Kafka **`run`** topic.
4. Another healthy Executor picks up the job and continues processing.

This provides automatic recovery from Executor failures.

---

# Q) How can a running job be cancelled?

A dedicated Redis cluster is used for job cancellation.

### Flow

1. User requests cancellation.
2. The cancellation service stores the Job ID in Redis.
3. Every Executor has a lightweight background thread that continuously checks Redis.
4. While executing a job, the Executor verifies whether its Job ID exists in Redis.
5. If found, the Executor immediately terminates execution and updates the job status to **CANCELLED**.

### Why Redis?

Redis provides:

* extremely fast lookups
* distributed access across Executors
* minimal latency

### Preventing Cache Growth

Cancellation requests are temporary.

Therefore every Redis entry has a TTL (for example, **30 seconds**).

Benefits:

* automatic cleanup
* avoids duplicate entries
* keeps memory usage low

---

# Q) How are immediate jobs handled?

Most scheduled jobs follow the normal pipeline:

```
Job Service
      ↓
Job DB
      ↓
Watcher
      ↓
Kafka
      ↓
Executor
```

However, this introduces unnecessary delay for jobs that need immediate execution.

### Case 1 — User submits an Immediate Job

If the job is marked as **Immediate**, the Job Service bypasses the Watcher completely.

```
Job Service
      ↓
Kafka (run)
      ↓
Executor
```

This significantly reduces execution latency.

---

### Case 2 — Scheduled Time is Very Close

Suppose:

```
Current Time : 5:00:00 PM

Scheduled Time : 5:00:10 PM

Watcher Poll Interval : 20 seconds
```

If the Watcher polls exactly at **5:00:00 PM**, the new job may not yet exist in the database.

The next poll occurs at **5:00:20 PM**, meaning the job scheduled for **5:00:10 PM** is missed.

To avoid this issue:

If

```
scheduled_time - current_time < watcher_poll_interval
```

the Job Service treats it as an immediate job and publishes it directly to Kafka.

### Therefore, the Job Service bypasses the Watcher in two scenarios:

1. The user explicitly marks the job as **Immediate**.
2. The scheduled execution time is less than the Watcher's polling interval away.

---
---
##Note :- 
Although the Job Service publishes immediate jobs directly to Kafka, Kafka is still a message queue. If there are already pending jobs ahead of the newly published job in the topic or partition, the Executor will process them first.

Therefore, **directly publishing a job to Kafka reduces scheduling latency by bypassing the Watcher Service, but it does not guarantee immediate execution**. The actual execution time still depends on factors such as queue backlog, partition ordering, and Executor availability.
---

# Q) What happens if the Watcher Service goes down?

The Watcher continuously polls jobs from the database.

If it crashes, the new Watcher instance must know where to resume polling.

To solve this, a dedicated Redis cache stores:

```
last_polled_timestamp
```

### Recovery Flow

1. Watcher updates `last_polled_timestamp` after every successful polling cycle.
2. If the Watcher crashes, Redis still contains the latest timestamp.
3. When a new Watcher instance starts, it retrieves this timestamp.
4. Polling resumes from the stored timestamp instead of starting from the current time.

This prevents missing scheduled jobs after a Watcher restart.

---

# Q) How can the Watcher query the Job table efficiently?

## 1. Table Partitioning

The `Job` table is partitioned based on **scheduled_time**.

Since the Watcher always queries jobs within a specific time window, partitioning significantly reduces the amount of data scanned.

Instead of scanning the entire table, only the relevant partition is searched.

---

## 2. Indexing on Job Table

The primary access pattern for APIs is:

```
Find Job by Job ID
```

Therefore, the Job table maintains an index on:

```
job_id
```

This enables fast lookups for API requests.

---

## 3. Optimizing Job_Runs Queries

The Watcher frequently executes queries similar to:

```
status = RUNNING
AND
last_modified < threshold
```

To optimize these queries, a composite index is created on:

```
(status, last_modified)
```

This allows efficient retrieval of stale running executions.

Additionally, an index is maintained on:

```
job_id
```

to quickly map a Job Run back to its corresponding Job.

### Summary of Indexes

**Job Table**

* Partition Key: `scheduled_time`
* Index: `job_id`

**Job_Runs Table**

* Composite Index: `(status, last_modified)`
* Index: `job_id`

These optimizations minimize query latency and allow the Watcher to efficiently process millions of scheduled jobs.
