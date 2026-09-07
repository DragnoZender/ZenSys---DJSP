# Walkthrough - Cross-Service Updates for Watcher Service Preparation

All three services (`job-service`, `consumer-service`, and `job-search-service`) have been updated and verified to support the full job lifecycle and watcher polling requirements.

---

## Summary of Changes

### 1. Status Enums
* **`JobStatus`** (Updated in all 3 services):
  Added `COMPLETED` (for finished `ONCE` jobs) and `FAILED_PERMANENTLY` (when retries are exhausted and jobs hit DLQ):
  ```java
  SCHEDULED,
  RUNNING,
  PAUSED,
  CANCELLED,
  COMPLETED,
  FAILED_PERMANENTLY
  ```
* **`JobRunStatus`** ([JobRunStatus.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/consumer-service/src/main/java/com/zensys/consumer_service/model/JobRunStatus.java)):
  Added `PENDING`, `TIMEOUT`, `CANCELLED`, and `EXECUTOR_DIED` to match Section 8 of the design doc:
  ```java
  PENDING,
  QUEUED,
  RUNNING,
  SUCCESS,
  FAILED,
  TIMEOUT,
  CANCELLED,
  EXECUTOR_DIED
  ```

---

### 2. `job-service`
* **Scheduling Calculation ([JobService.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/job-service/src/main/java/com/zensys/job_service/service/JobService.java))**:
  * Implemented `calculateNextRunTime()` for all three schedule types:
    * `ONCE`: Uses `scheduleTime` (or `Instant.now()`).
    * `CRON`: Evaluates cron expressions against **IST (`Asia/Kolkata`)** by default (or custom timezone passed in `meta`), converting to normalized UTC `Instant` for storage and polling. Supports both 5-part and 6-part cron expressions.
    * `INTERVAL`: Parses `intervalSeconds` (or `interval`) from `meta` JSON (per Approach B) and sets next run time accordingly.
* **Application Timezone Initialization**:
  * Configured `@PostConstruct` in `JobServiceApplication`, `ConsumerServiceApplication`, and `JobSearchServiceApplication` to set `TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"))`.
* **Kafka Event Contract ([JobCommand.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/job-service/src/main/java/com/zensys/job_service/event/JobCommand.java))**:
  * Added `nextRunTime` and `lastPolledTime` fields to `JobCommand`.
* **Build Config ([pom.xml](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/job-service/pom.xml))**:
  * Configured `maven-compiler-plugin` with Lombok `annotationProcessorPaths` matching the other modules.

---

### 3. `consumer-service`
* **Database Model ([Job.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/consumer-service/src/main/java/com/zensys/consumer_service/model/Job.java))**:
  * Added `nextRunTime` (`@Column(name = "next_run_time")`).
  * Added `lastPolledTime` (`@Column(name = "last_polled_time")`).
  * Made `scheduleTime` nullable (since `CRON` jobs don't require an initial timestamp).
  * Added composite index `@Index(name = "idx_watcher_poll", columnList = "next_run_time, status, last_polled_time")` for high-throughput watcher polling.
* **Kafka Command Contract ([JobCommand.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/consumer-service/src/main/java/com/zensys/consumer_service/event/JobCommand.java))**:
  * Added `nextRunTime` and `lastPolledTime`.
* **Persistence Logic ([JobPersistenceService.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/consumer-service/src/main/java/com/zensys/consumer_service/service/JobPersistenceService.java))**:
  * Mapped `nextRunTime` and `lastPolledTime` in both `saveJob()` and `updateJob()`.

---

### 4. `job-search-service`
* **Entity Synchronization ([Job.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/job-search-service/src/main/java/com/zensys/job_search_service/model/Job.java))**:
  * Added `nextRunTime`, `lastPolledTime`, nullable `scheduleTime`, and matching `idx_watcher_poll` index so `ddl-auto=validate` remains consistent with PostgreSQL.
* **API Response & Service ([JobResponse.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/job-search-service/src/main/java/com/zensys/job_search_service/dto/JobResponse.java) & [JobSearchService.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/job-search-service/src/main/java/com/zensys/job_search_service/service/JobSearchService.java))**:
  * Exposed `nextRunTime` and `lastPolledTime` in search/details endpoints.

---

## Verification Results

Executed clean test compilations across all three microservices:

```powershell
mvn clean test-compile -f "job-service/pom.xml"        # BUILD SUCCESS (10 source files)
mvn clean test-compile -f "consumer-service/pom.xml"   # BUILD SUCCESS (13 source files)
mvn clean test-compile -f "job-search-service/pom.xml" # BUILD SUCCESS (8 source files)
```

All services compiled with **0 errors**.
