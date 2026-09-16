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
import com.zensys.consumer_service.repository.JobRepository;
import com.zensys.consumer_service.repository.JobRunRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class JobRunPersistenceService {

    private final JobRepository jobRepository;
    private final JobRunRepository jobRunRepository;

    @Transactional
    public void processLifecycleEvent(JobRunLifecycleEvent event) {
        if (event.getRunId() == null || event.getJobId() == null) {
            log.warn("Discarding malformed lifecycle event missing runId or jobId: {}", event);
            return;
        }

        Job job = jobRepository.findById(event.getJobId()).orElse(null);
        if (job == null) {
            log.warn("Job not found for jobId={} while processing lifecycle event runId={}",
                    event.getJobId(), event.getRunId());
            return;
        }

        Instant eventTime = event.getTimestamp() != null ? event.getTimestamp() : Instant.now();

        switch (event.getStatus()) {
            case PENDING -> handlePending(event, job, eventTime);
            case RUNNING -> handleRunning(event, job, eventTime);
            case SUCCESS -> handleSuccess(event, job, eventTime);
            case FAILED, TIMEOUT -> handleFailureOrTimeout(event, job, eventTime);
            default -> log.warn("Unhandled lifecycle status '{}' for runId={}", event.getStatus(), event.getRunId());
        }
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
    }

    private void handlePending(JobRunLifecycleEvent event, Job job, Instant eventTime) {
        Optional<JobRun> existing = jobRunRepository.findByRunId(event.getRunId());
        if (existing.isPresent()) {
            log.info("JobRun runId={} already exists (status={}), skipping PENDING duplicate",
                    event.getRunId(), existing.get().getStatus());
            return;
        }

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

    private void handleRunning(JobRunLifecycleEvent event, Job job, Instant eventTime) {
        JobRun run = jobRunRepository.findByRunId(event.getRunId()).orElseGet(() -> {
            log.info("JobRun runId={} not present on RUNNING event, creating it now", event.getRunId());
            return JobRun.builder()
                    .runId(event.getRunId())
                    .job(job)
                    .attemptNumber(event.getAttempt() != null ? event.getAttempt() : 1)
                    .build();
        });

        run.setStatus(JobRunStatus.RUNNING);
        run.setStartTime(eventTime);
        run.setExecutorId(event.getExecutorId());
        run.setModificationTime(Instant.now());
        jobRunRepository.save(run);

        job.setStatus(JobStatus.RUNNING);
        jobRepository.save(job);

        log.info("Updated JobRun to RUNNING: runId={}, executorId={}, job status set to RUNNING",
                event.getRunId(), event.getExecutorId());
    }

    private void handleSuccess(JobRunLifecycleEvent event, Job job, Instant eventTime) {
        JobRun run = jobRunRepository.findByRunId(event.getRunId()).orElse(null);
        if (run != null) {
            run.setStatus(JobRunStatus.SUCCESS);
            run.setEndTime(eventTime);
            run.setExecutionTimeMs(event.getExecutionTimeMs());
            run.setModificationTime(Instant.now());
            jobRunRepository.save(run);
        } else {
            log.warn("JobRun runId={} not found when processing SUCCESS event", event.getRunId());
        }

        job.setStatus(JobStatus.SCHEDULED);
        jobRepository.save(job);

        log.info("Updated JobRun to SUCCESS: runId={}, duration={}ms, job status reset to SCHEDULED",
                event.getRunId(), event.getExecutionTimeMs());
    }

    private void handleFailureOrTimeout(JobRunLifecycleEvent event, Job job, Instant eventTime) {
        JobRun run = jobRunRepository.findByRunId(event.getRunId()).orElse(null);
        if (run != null) {
            run.setStatus(event.getStatus());
            run.setEndTime(eventTime);
            run.setExecutionTimeMs(event.getExecutionTimeMs());
            run.setErrorMsg(event.getErrorMsg());
            run.setModificationTime(Instant.now());
            jobRunRepository.save(run);
        } else {
            log.warn("JobRun runId={} not found when processing {} event", event.getRunId(), event.getStatus());
        }

        // Job status returns to SCHEDULED so retry or next recurrence can pick it up
        job.setStatus(JobStatus.SCHEDULED);
        jobRepository.save(job);

        log.info("Updated JobRun to {}: runId={}, duration={}ms, error='{}'",
                event.getStatus(), event.getRunId(), event.getExecutionTimeMs(), event.getErrorMsg());
    }
}
