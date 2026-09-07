# Preparation for Watcher Service: Cross-Service Updates

Update the three implemented services (`job-service`, `consumer-service`, and `job-search-service`) to align entities, DTOs, Kafka command contracts, and lifecycle statuses with the system design doc, paving the way for the upcoming `watcher-service`.

## Proposed Changes

### 1. Shared Status Enums

#### [MODIFY] [JobStatus.java (job-service)](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/job-service/src/main/java/com/zensys/job_service/model/JobStatus.java)
#### [MODIFY] [JobStatus.java (consumer-service)](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/consumer-service/src/main/java/com/zensys/consumer_service/model/JobStatus.java)
#### [MODIFY] [JobStatus.java (job-search-service)](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/job-search-service/src/main/java/com/zensys/job_search_service/model/JobStatus.java)
- Update enum values to include terminal states:
  ```java
  SCHEDULED,
  RUNNING,
  PAUSED,
  CANCELLED,
  COMPLETED,
  FAILED_PERMANENTLY
  ```

#### [MODIFY] [JobRunStatus.java (consumer-service)](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/consumer-service/src/main/java/com/zensys/consumer_service/model/JobRunStatus.java)
- Align with Design Doc Section 8:
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

### 2. job-service

#### [MODIFY] [JobCommand.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/job-service/src/main/java/com/zensys/job_service/event/JobCommand.java)
- Add `nextRunTime` and `lastPolledTime` (`Instant`) to Kafka event schema.

#### [MODIFY] [CreateJobRequest.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/job-service/src/main/java/com/zensys/job_service/dto/CreateJobRequest.java)
#### [MODIFY] [UpdateJobRequest.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/job-service/src/main/java/com/zensys/job_service/dto/UpdateJobRequest.java)
- Add optional `intervalSeconds` (for `ScheduleType.INTERVAL`).

#### [MODIFY] [JobService.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/job-service/src/main/java/com/zensys/job_service/service/JobService.java)
- In `createJob()`:
  - Calculate initial `nextRunTime`:
    - `ONCE`: `scheduleTime != null ? scheduleTime : Instant.now()`
    - `CRON`: Calculate using `org.springframework.scheduling.support.CronExpression.parse(cron).next(ZonedDateTime.now(ZoneOffset.UTC)).toInstant()`
    - `INTERVAL`: Calculate next run time using `scheduleTime` or `Instant.now().plusSeconds(intervalSeconds)`
  - Forward `nextRunTime` in `JobCommand`.
- In `updateJob()`:
  - Recalculate `nextRunTime` when schedule configuration is updated.

---

### 3. consumer-service

#### [MODIFY] [Job.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/consumer-service/src/main/java/com/zensys/consumer_service/model/Job.java)
- Add columns:
  - `nextRunTime` (`@Column(name = "next_run_time")`)
  - `lastPolledTime` (`@Column(name = "last_polled_time")`)
- Make `scheduleTime` nullable (`@Column(name = "schedule_time")`), since `CRON` jobs do not require a fixed timestamp.
- Add composite index for watcher query efficiency:
  `@Index(name = "idx_watcher_poll", columnList = "next_run_time, status, last_polled_time")`

#### [MODIFY] [JobCommand.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/consumer-service/src/main/java/com/zensys/consumer_service/event/JobCommand.java)
- Add `nextRunTime` and `lastPolledTime` (`Instant`) to match the event payload produced by `job-service`.

#### [MODIFY] [JobPersistenceService.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/consumer-service/src/main/java/com/zensys/consumer_service/service/JobPersistenceService.java)
- In `saveJob()`: Map `nextRunTime` and `lastPolledTime` from `JobCommand` to `Job` entity.
- In `updateJob()`: Update `nextRunTime` and `lastPolledTime` when present.

---

### 4. job-search-service

#### [MODIFY] [Job.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/job-search-service/src/main/java/com/zensys/job_search_service/model/Job.java)
- Mirror `consumer-service` `Job` entity structure (`nextRunTime`, `lastPolledTime`, nullable `scheduleTime`, and matching `@Index` declarations) so Hibernate `ddl-auto=validate` matches PostgreSQL table schema.

#### [MODIFY] [JobResponse.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/job-search-service/src/main/java/com/zensys/job_search_service/dto/JobResponse.java)
- Add `nextRunTime` and `lastPolledTime` to the API response.

#### [MODIFY] [JobSearchService.java](file:///d:/DZ%20Playground/ZenSys%20-%20DJSP/Backend/job-search-service/src/main/java/com/zensys/job_search_service/service/JobSearchService.java)
- Map `job.getNextRunTime()` and `job.getLastPolledTime()` to `JobResponse`.

---

## Verification Plan

### Automated Compilation & Testing
- Run Maven compilation checks across all three services using PowerShell:
  ```powershell
  mvn test-compile -f "job-service/pom.xml"
  mvn test-compile -f "consumer-service/pom.xml"
  mvn test-compile -f "job-search-service/pom.xml"
  ```
- Verify zero compilation or type mismatch errors across all three modules.
