package com.zensys.consumer_service.service;

import java.time.Instant;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.zensys.consumer_service.event.JobDeadEvent;
import com.zensys.consumer_service.event.JobRunLifecycleEvent;
import com.zensys.consumer_service.model.Job;
import com.zensys.consumer_service.model.JobRun;
import com.zensys.consumer_service.model.JobRunStatus;
import com.zensys.consumer_service.model.JobStatus;
import com.zensys.consumer_service.model.ProcessedEvent;
import com.zensys.consumer_service.model.ScheduleType;
import com.zensys.consumer_service.repository.JobRepository;
import com.zensys.consumer_service.repository.JobRunRepository;
import com.zensys.consumer_service.repository.ProcessedEventRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class JobRunPersistenceService {

    private final JobRepository jobRepository;
    private final JobRunRepository jobRunRepository;
    private final ProcessedEventRepository processedEventRepository;

    @Transactional
    public void processLifecycleEvent(JobRunLifecycleEvent event) {
        if (event.getRunId() == null || event.getJobId() == null) {
            log.warn("Discarding malformed lifecycle event missing runId or jobId: {}", event);
            return;
        }

        // =========================================================================
        // LAYER 1 IDEMPOTENCY: Exact Message Deduplication via eventId
        // =========================================================================
        if (event.getEventId() != null && processedEventRepository.existsById(event.getEventId())) {
            log.info(
                    "Lifecycle event with eventId='{}' (runId={}, status={}) has already been processed. Skipping duplicate.",
                    event.getEventId(), event.getRunId(), event.getStatus());
            return;
        }

        Job job = jobRepository.findById(event.getJobId()).orElse(null);
        if (job == null) {
            log.warn("Job not found for jobId={} while processing lifecycle event runId={}",
                    event.getJobId(), event.getRunId());
            return;
        }

        Instant eventTime = event.getTimestamp() != null ? event.getTimestamp() : Instant.now();

        // =========================================================================
        // LAYER 2 IDEMPOTENCY: State Machine Transition Guard (Out-of-Order Safety)
        // =========================================================================
        Optional<JobRun> existingRunOpt = jobRunRepository.findByRunId(event.getRunId());

        if (existingRunOpt.isPresent()) {
            JobRun currentRun = existingRunOpt.get();

            // Rule 1: If current status is already in a terminal state (SUCCESS, FAILED,
            // TIMEOUT, etc.),
            // NEVER regress backward! Ignore incoming PENDING or RUNNING events.
            if (currentRun.getStatus().isTerminal()) {
                log.info("Run runId='{}' is already finished with terminal status '{}'. Ignoring incoming '{}' event.",
                        currentRun.getRunId(), currentRun.getStatus(), event.getStatus());
                recordProcessedEvent(event.getEventId());
                return;
            }

            // Rule 2: If current status is RUNNING, ignore late PENDING or duplicate
            // RUNNING.
            if (currentRun.getStatus() == JobRunStatus.RUNNING) {
                if (event.getStatus() == JobRunStatus.PENDING || event.getStatus() == JobRunStatus.RUNNING) {
                    log.info("Run runId='{}' is already RUNNING. Ignoring incoming '{}' event.",
                            currentRun.getRunId(), event.getStatus());
                    recordProcessedEvent(event.getEventId());
                    return;
                }
            }

            // Apply forward transition
            switch (event.getStatus()) {
                case RUNNING -> {
                    currentRun.setStatus(JobRunStatus.RUNNING);
                    currentRun.setStartTime(eventTime);
                    currentRun.setExecutorId(event.getExecutorId());
                    currentRun.setModificationTime(Instant.now());
                    jobRunRepository.save(currentRun);

                    if (!isJobInTerminalState(job)) {
                        job.setStatus(JobStatus.RUNNING);
                        jobRepository.save(job);
                        log.info("Transitioned runId={} to RUNNING on executor={}", currentRun.getRunId(),
                                event.getExecutorId());
                    } else {
                        log.info("Job {} is in terminal status '{}'; ignoring RUNNING status transition",
                                job.getId(), job.getStatus());
                    }
                }
                case SUCCESS -> {
                    currentRun.setStatus(JobRunStatus.SUCCESS);
                    currentRun.setEndTime(eventTime);
                    currentRun.setExecutionTimeMs(event.getExecutionTimeMs());
                    currentRun.setModificationTime(Instant.now());
                    jobRunRepository.save(currentRun);

                    updateJobStatusOnTerminalRun(job, JobRunStatus.SUCCESS);
                    log.info("Transitioned runId={} to SUCCESS (duration={}ms)", currentRun.getRunId(),
                            event.getExecutionTimeMs());
                }
                case FAILED, TIMEOUT -> {
                    currentRun.setStatus(event.getStatus());
                    currentRun.setEndTime(eventTime);
                    currentRun.setExecutionTimeMs(event.getExecutionTimeMs());
                    currentRun.setErrorMsg(event.getErrorMsg());
                    currentRun.setModificationTime(Instant.now());
                    jobRunRepository.save(currentRun);

                    updateJobStatusOnTerminalRun(job, event.getStatus());
                    log.info("Transitioned runId={} to {} (error='{}')", currentRun.getRunId(), event.getStatus(),
                            event.getErrorMsg());
                }
                default -> log.warn("Unhandled lifecycle status '{}' for existing runId={}", event.getStatus(),
                        currentRun.getRunId());
            }

        } else {
            // JobRun does not exist in DB yet (normal for PENDING, or out-of-order if
            // RUNNING/SUCCESS arrives first)
            switch (event.getStatus()) {
                case PENDING -> {
                    JobRun run = JobRun.builder()
                            .runId(event.getRunId())
                            .job(job)
                            .status(JobRunStatus.PENDING)
                            .attemptNumber(event.getAttempt() != null ? event.getAttempt() : 1)
                            .modificationTime(eventTime)
                            .build();
                    jobRunRepository.save(run);
                    log.info("Created PENDING run record: runId={}, jobId={}, attempt={}",
                            event.getRunId(), event.getJobId(), event.getAttempt());
                }
                case RUNNING -> {
                    // RUNNING arrived before PENDING
                    JobRun run = JobRun.builder()
                            .runId(event.getRunId())
                            .job(job)
                            .status(JobRunStatus.RUNNING)
                            .startTime(eventTime)
                            .executorId(event.getExecutorId())
                            .attemptNumber(event.getAttempt() != null ? event.getAttempt() : 1)
                            .modificationTime(Instant.now())
                            .build();
                    jobRunRepository.save(run);

                    if (!isJobInTerminalState(job)) {
                        job.setStatus(JobStatus.RUNNING);
                        jobRepository.save(job);
                        log.info("Created RUNNING run record (arrived before PENDING): runId={}, executorId={}",
                                event.getRunId(), event.getExecutorId());
                    } else {
                        log.info("Job {} is in terminal status '{}'; ignoring RUNNING status transition for runId={}",
                                job.getId(), job.getStatus(), event.getRunId());
                    }
                }
                case SUCCESS, FAILED, TIMEOUT -> {
                    // Fast execution where terminal state arrived before PENDING or RUNNING
                    JobRun run = JobRun.builder()
                            .runId(event.getRunId())
                            .job(job)
                            .status(event.getStatus())
                            .endTime(eventTime)
                            .executionTimeMs(event.getExecutionTimeMs())
                            .errorMsg(event.getErrorMsg())
                            .attemptNumber(event.getAttempt() != null ? event.getAttempt() : 1)
                            .modificationTime(Instant.now())
                            .build();
                    jobRunRepository.save(run);

                    updateJobStatusOnTerminalRun(job, event.getStatus());
                    log.info("Created {} run record (arrived out-of-order): runId={}, duration={}ms",
                            event.getStatus(), event.getRunId(), event.getExecutionTimeMs());
                }
                default ->
                    log.warn("Unhandled lifecycle status '{}' for new runId={}", event.getStatus(), event.getRunId());
            }
        }

        // Record eventId as processed (Layer 1)
        recordProcessedEvent(event.getEventId());
    }

    @Transactional
    public void processDeadEvent(JobDeadEvent event) {
        if (event.getJobId() == null) {
            log.warn("Discarding malformed dead event missing jobId: {}", event);
            return;
        }

        Job job = jobRepository.findById(event.getJobId()).orElse(null);
        if (job != null) {
            job.setStatus(JobStatus.FAILED_PERMANENTLY);
            jobRepository.save(job);
            log.warn("Job {} marked as FAILED_PERMANENTLY after exhausting all {} retries. Final error: '{}'",
                    event.getJobId(), event.getMaxRetries(), event.getErrorMsg());
        } else {
            log.warn("Job not found for jobId={} while processing dead event", event.getJobId());
        }

        // Guard: Synchronize corresponding JobRun if already persisted
        if (event.getRunId() != null) {
            jobRunRepository.findByRunId(event.getRunId()).ifPresent(run -> {
                if (!run.getStatus().isTerminal()) {
                    run.setStatus(JobRunStatus.FAILED);
                    run.setErrorMsg(event.getErrorMsg());
                    run.setEndTime(event.getTimestamp() != null ? event.getTimestamp() : Instant.now());
                    run.setModificationTime(Instant.now());
                    jobRunRepository.save(run);
                    log.info("Synchronized runId={} to FAILED from early JobDeadEvent", run.getRunId());
                }
            });
        }
    }

    private void updateJobStatusOnTerminalRun(Job job, JobRunStatus runStatus) {
        if (isJobInTerminalState(job)) {
            log.info("Job {} is already in terminal status '{}'; ignoring terminal update from runStatus={}",
                    job.getId(), job.getStatus(), runStatus);
            return;
        }

        ScheduleType scheduleType = job.getScheduleType() != null ? job.getScheduleType() : ScheduleType.ONCE;
        if (runStatus == JobRunStatus.SUCCESS) {
            if (scheduleType == ScheduleType.ONCE) {
                job.setStatus(JobStatus.COMPLETED);
                log.info("Job {} is ScheduleType.ONCE; transitioned status to COMPLETED", job.getId());
            } else {
                job.setStatus(JobStatus.SCHEDULED);
                log.info("Job {} is ScheduleType.{}; reset status to SCHEDULED", job.getId(), scheduleType);
            }
            jobRepository.save(job);
        } else {
            // On FAILED or TIMEOUT:
            // All jobs (ONCE, CRON, INTERVAL) follow the retry pipeline.
            // Retain RUNNING status to avoid false SCHEDULED flapping while retries are
            // in-flight.
            // If all retries exhaust, processDeadEvent() marks the job as
            // FAILED_PERMANENTLY.
            log.info("Job {} is ScheduleType.{}; retaining status {} during failure/retry",
                    job.getId(), scheduleType, job.getStatus());
        }
    }

    private boolean isJobInTerminalState(Job job) {
        if (job.getStatus() == null) {
            return false;
        }
        return job.getStatus() == JobStatus.FAILED_PERMANENTLY
                || job.getStatus() == JobStatus.COMPLETED
                || job.getStatus() == JobStatus.CANCELLED;
    }

    private void recordProcessedEvent(String eventId) {
        if (eventId != null && !eventId.isBlank()) {
            processedEventRepository.save(
                    ProcessedEvent.builder()
                            .eventId(eventId)
                            .processedAt(Instant.now())
                            .build());
        }
    }
}
