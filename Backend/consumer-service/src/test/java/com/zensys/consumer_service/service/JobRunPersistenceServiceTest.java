package com.zensys.consumer_service.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

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

@ExtendWith(MockitoExtension.class)
class JobRunPersistenceServiceTest {

    @Mock
    private JobRepository jobRepository;

    @Mock
    private JobRunRepository jobRunRepository;

    @Mock
    private ProcessedEventRepository processedEventRepository;

    @InjectMocks
    private JobRunPersistenceService persistenceService;

    private Job testJob;

    @BeforeEach
    void setUp() {
        testJob = Job.builder()
                .id("job-001")
                .name("Test Job")
                .scheduleType(ScheduleType.ONCE)
                .status(JobStatus.SCHEDULED)
                .retries(3)
                .build();
    }

    // =========================================================================
    // LAYER 1 TESTS: Event Deduplication via eventId
    // =========================================================================

    @Test
    void testLayer1_DuplicateEventId_SkippedImmediately() {
        when(processedEventRepository.existsById("evt-dup-123")).thenReturn(true);

        JobRunLifecycleEvent event = JobRunLifecycleEvent.builder()
                .eventId("evt-dup-123")
                .runId("run-001")
                .jobId("job-001")
                .status(JobRunStatus.PENDING)
                .attempt(1)
                .build();

        persistenceService.processLifecycleEvent(event);

        // Zero DB queries or updates performed on job_runs or jobs
        verify(jobRepository, never()).findById(any());
        verify(jobRunRepository, never()).findByRunId(any());
        verify(jobRunRepository, never()).save(any());
    }

    // =========================================================================
    // LAYER 2 TESTS: State Machine Transition Guards (Out-of-Order Safety)
    // =========================================================================

    @Test
    void testLayer2_SuccessArrivesBeforeDelayedRunning_RunningIsIgnored() {
        when(processedEventRepository.existsById("evt-running-late")).thenReturn(false);
        when(jobRepository.findById("job-001")).thenReturn(Optional.of(testJob));

        // Existing run is already in SUCCESS (terminal state)
        JobRun finishedRun = JobRun.builder()
                .runId("run-001")
                .job(testJob)
                .status(JobRunStatus.SUCCESS)
                .attemptNumber(1)
                .endTime(Instant.now().minusSeconds(1))
                .executionTimeMs(100L)
                .build();
        when(jobRunRepository.findByRunId("run-001")).thenReturn(Optional.of(finishedRun));

        // Delayed RUNNING event arrives
        JobRunLifecycleEvent runningEvent = JobRunLifecycleEvent.builder()
                .eventId("evt-running-late")
                .runId("run-001")
                .jobId("job-001")
                .status(JobRunStatus.RUNNING)
                .attempt(1)
                .executorId("executor-8086")
                .timestamp(Instant.now())
                .build();

        persistenceService.processLifecycleEvent(runningEvent);

        // Verify run was NOT modified or saved
        verify(jobRunRepository, never()).save(any());
        assertThat(finishedRun.getStatus()).isEqualTo(JobRunStatus.SUCCESS);

        // Verify job status was NOT reverted to RUNNING
        verify(jobRepository, never()).save(any());
        assertThat(testJob.getStatus()).isEqualTo(JobStatus.SCHEDULED);

        // Verify the event was marked as processed
        verify(processedEventRepository).save(any(ProcessedEvent.class));
    }

    @Test
    void testLayer2_RunningArrivesBeforeDelayedPending_PendingIsIgnored() {
        when(processedEventRepository.existsById("evt-pending-late")).thenReturn(false);
        when(jobRepository.findById("job-001")).thenReturn(Optional.of(testJob));

        // Existing run is already RUNNING
        JobRun runningRun = JobRun.builder()
                .runId("run-001")
                .job(testJob)
                .status(JobRunStatus.RUNNING)
                .attemptNumber(1)
                .executorId("executor-8086")
                .build();
        when(jobRunRepository.findByRunId("run-001")).thenReturn(Optional.of(runningRun));

        // Delayed PENDING event arrives
        JobRunLifecycleEvent pendingEvent = JobRunLifecycleEvent.builder()
                .eventId("evt-pending-late")
                .runId("run-001")
                .jobId("job-001")
                .status(JobRunStatus.PENDING)
                .attempt(1)
                .build();

        persistenceService.processLifecycleEvent(pendingEvent);

        // Run must remain RUNNING, never downgraded to PENDING
        verify(jobRunRepository, never()).save(any());
        assertThat(runningRun.getStatus()).isEqualTo(JobRunStatus.RUNNING);

        verify(processedEventRepository).save(any(ProcessedEvent.class));
    }

    @Test
    void testLayer2_TerminalEventArrivesFirst_OnceJob_SetsJobCompleted() {
        when(processedEventRepository.existsById("evt-fast-success")).thenReturn(false);
        when(jobRepository.findById("job-001")).thenReturn(Optional.of(testJob));
        when(jobRunRepository.findByRunId("run-001")).thenReturn(Optional.empty());

        // Fast ONCE job finishes and SUCCESS event arrives before PENDING
        JobRunLifecycleEvent successEvent = JobRunLifecycleEvent.builder()
                .eventId("evt-fast-success")
                .runId("run-001")
                .jobId("job-001")
                .status(JobRunStatus.SUCCESS)
                .attempt(1)
                .executionTimeMs(50L)
                .timestamp(Instant.now())
                .build();

        persistenceService.processLifecycleEvent(successEvent);

        ArgumentCaptor<JobRun> captor = ArgumentCaptor.forClass(JobRun.class);
        verify(jobRunRepository).save(captor.capture());
        JobRun savedRun = captor.getValue();

        assertThat(savedRun.getRunId()).isEqualTo("run-001");
        assertThat(savedRun.getStatus()).isEqualTo(JobRunStatus.SUCCESS);
        assertThat(savedRun.getExecutionTimeMs()).isEqualTo(50L);

        verify(jobRepository).save(testJob);
        assertThat(testJob.getStatus()).isEqualTo(JobStatus.COMPLETED);
    }

    @Test
    void testLayer2_TerminalEventArrivesFirst_CronJob_SetsJobScheduled() {
        Job cronJob = Job.builder()
                .id("job-cron-001")
                .name("Cron Job")
                .scheduleType(ScheduleType.CRON)
                .status(JobStatus.RUNNING)
                .build();

        when(processedEventRepository.existsById("evt-cron-fast")).thenReturn(false);
        when(jobRepository.findById("job-cron-001")).thenReturn(Optional.of(cronJob));
        when(jobRunRepository.findByRunId("run-cron-001")).thenReturn(Optional.empty());

        JobRunLifecycleEvent successEvent = JobRunLifecycleEvent.builder()
                .eventId("evt-cron-fast")
                .runId("run-cron-001")
                .jobId("job-cron-001")
                .status(JobRunStatus.SUCCESS)
                .attempt(1)
                .executionTimeMs(60L)
                .timestamp(Instant.now())
                .build();

        persistenceService.processLifecycleEvent(successEvent);

        verify(jobRepository).save(cronJob);
        assertThat(cronJob.getStatus()).isEqualTo(JobStatus.SCHEDULED);
    }

    // =========================================================================
    // STANDARD LIFECYCLE TRANSITION TESTS
    // =========================================================================

    @Test
    void testProcessLifecycleEvent_Pending_CreatesNewJobRun() {
        when(processedEventRepository.existsById("evt-001")).thenReturn(false);
        when(jobRepository.findById("job-001")).thenReturn(Optional.of(testJob));
        when(jobRunRepository.findByRunId("run-001")).thenReturn(Optional.empty());

        JobRunLifecycleEvent event = JobRunLifecycleEvent.builder()
                .eventId("evt-001")
                .runId("run-001")
                .jobId("job-001")
                .status(JobRunStatus.PENDING)
                .attempt(1)
                .timestamp(Instant.now())
                .build();

        persistenceService.processLifecycleEvent(event);

        ArgumentCaptor<JobRun> captor = ArgumentCaptor.forClass(JobRun.class);
        verify(jobRunRepository).save(captor.capture());
        JobRun savedRun = captor.getValue();

        assertThat(savedRun.getRunId()).isEqualTo("run-001");
        assertThat(savedRun.getStatus()).isEqualTo(JobRunStatus.PENDING);
        assertThat(savedRun.getAttemptNumber()).isEqualTo(1);

        verify(processedEventRepository).save(any(ProcessedEvent.class));
    }

    @Test
    void testProcessLifecycleEvent_Running_UpdatesRunAndJobStatus() {
        when(processedEventRepository.existsById("evt-002")).thenReturn(false);
        when(jobRepository.findById("job-001")).thenReturn(Optional.of(testJob));
        JobRun existingRun = JobRun.builder()
                .runId("run-001")
                .job(testJob)
                .status(JobRunStatus.PENDING)
                .attemptNumber(1)
                .build();
        when(jobRunRepository.findByRunId("run-001")).thenReturn(Optional.of(existingRun));

        JobRunLifecycleEvent event = JobRunLifecycleEvent.builder()
                .eventId("evt-002")
                .runId("run-001")
                .jobId("job-001")
                .status(JobRunStatus.RUNNING)
                .attempt(1)
                .executorId("executor-8086")
                .timestamp(Instant.now())
                .build();

        persistenceService.processLifecycleEvent(event);

        verify(jobRunRepository).save(existingRun);
        assertThat(existingRun.getStatus()).isEqualTo(JobRunStatus.RUNNING);
        assertThat(existingRun.getExecutorId()).isEqualTo("executor-8086");

        verify(jobRepository).save(testJob);
        assertThat(testJob.getStatus()).isEqualTo(JobStatus.RUNNING);
    }

    @Test
    void testProcessLifecycleEvent_Success_OnceJob_SetsJobStatusToCompleted() {
        when(processedEventRepository.existsById("evt-003")).thenReturn(false);
        when(jobRepository.findById("job-001")).thenReturn(Optional.of(testJob));
        JobRun existingRun = JobRun.builder()
                .runId("run-001")
                .job(testJob)
                .status(JobRunStatus.RUNNING)
                .attemptNumber(1)
                .build();
        when(jobRunRepository.findByRunId("run-001")).thenReturn(Optional.of(existingRun));

        JobRunLifecycleEvent event = JobRunLifecycleEvent.builder()
                .eventId("evt-003")
                .runId("run-001")
                .jobId("job-001")
                .status(JobRunStatus.SUCCESS)
                .attempt(1)
                .executionTimeMs(150L)
                .timestamp(Instant.now())
                .build();

        persistenceService.processLifecycleEvent(event);

        verify(jobRunRepository).save(existingRun);
        assertThat(existingRun.getStatus()).isEqualTo(JobRunStatus.SUCCESS);
        assertThat(existingRun.getExecutionTimeMs()).isEqualTo(150L);

        verify(jobRepository).save(testJob);
        assertThat(testJob.getStatus()).isEqualTo(JobStatus.COMPLETED);
    }

    @Test
    void testProcessLifecycleEvent_Success_CronJob_ResetsJobStatusToScheduled() {
        Job cronJob = Job.builder()
                .id("job-cron-002")
                .name("Cron Job")
                .scheduleType(ScheduleType.CRON)
                .status(JobStatus.RUNNING)
                .build();

        when(processedEventRepository.existsById("evt-cron-003")).thenReturn(false);
        when(jobRepository.findById("job-cron-002")).thenReturn(Optional.of(cronJob));
        JobRun existingRun = JobRun.builder()
                .runId("run-cron-002")
                .job(cronJob)
                .status(JobRunStatus.RUNNING)
                .attemptNumber(1)
                .build();
        when(jobRunRepository.findByRunId("run-cron-002")).thenReturn(Optional.of(existingRun));

        JobRunLifecycleEvent event = JobRunLifecycleEvent.builder()
                .eventId("evt-cron-003")
                .runId("run-cron-002")
                .jobId("job-cron-002")
                .status(JobRunStatus.SUCCESS)
                .attempt(1)
                .executionTimeMs(150L)
                .timestamp(Instant.now())
                .build();

        persistenceService.processLifecycleEvent(event);

        verify(jobRunRepository).save(existingRun);
        assertThat(existingRun.getStatus()).isEqualTo(JobRunStatus.SUCCESS);

        verify(jobRepository).save(cronJob);
        assertThat(cronJob.getStatus()).isEqualTo(JobStatus.SCHEDULED);
    }

    @Test
    void testProcessLifecycleEvent_Success_IntervalJob_ResetsJobStatusToScheduled() {
        Job intervalJob = Job.builder()
                .id("job-interval-001")
                .name("Interval Job")
                .scheduleType(ScheduleType.INTERVAL)
                .status(JobStatus.RUNNING)
                .build();

        when(processedEventRepository.existsById("evt-interval-001")).thenReturn(false);
        when(jobRepository.findById("job-interval-001")).thenReturn(Optional.of(intervalJob));
        JobRun existingRun = JobRun.builder()
                .runId("run-interval-001")
                .job(intervalJob)
                .status(JobRunStatus.RUNNING)
                .attemptNumber(1)
                .build();
        when(jobRunRepository.findByRunId("run-interval-001")).thenReturn(Optional.of(existingRun));

        JobRunLifecycleEvent event = JobRunLifecycleEvent.builder()
                .eventId("evt-interval-001")
                .runId("run-interval-001")
                .jobId("job-interval-001")
                .status(JobRunStatus.SUCCESS)
                .attempt(1)
                .executionTimeMs(200L)
                .timestamp(Instant.now())
                .build();

        persistenceService.processLifecycleEvent(event);

        verify(jobRunRepository).save(existingRun);
        assertThat(existingRun.getStatus()).isEqualTo(JobRunStatus.SUCCESS);

        verify(jobRepository).save(intervalJob);
        assertThat(intervalJob.getStatus()).isEqualTo(JobStatus.SCHEDULED);
    }

    @Test
    void testProcessLifecycleEvent_Failed_OnceJob_RetainsStatusAndDoesNotResetToScheduled() {
        testJob.setStatus(JobStatus.RUNNING);
        when(processedEventRepository.existsById("evt-004")).thenReturn(false);
        when(jobRepository.findById("job-001")).thenReturn(Optional.of(testJob));
        JobRun existingRun = JobRun.builder()
                .runId("run-001")
                .job(testJob)
                .status(JobRunStatus.RUNNING)
                .attemptNumber(1)
                .build();
        when(jobRunRepository.findByRunId("run-001")).thenReturn(Optional.of(existingRun));

        JobRunLifecycleEvent event = JobRunLifecycleEvent.builder()
                .eventId("evt-004")
                .runId("run-001")
                .jobId("job-001")
                .status(JobRunStatus.FAILED)
                .attempt(1)
                .errorMsg("NullPointerException")
                .executionTimeMs(45L)
                .timestamp(Instant.now())
                .build();

        persistenceService.processLifecycleEvent(event);

        verify(jobRunRepository).save(existingRun);
        assertThat(existingRun.getStatus()).isEqualTo(JobRunStatus.FAILED);
        assertThat(existingRun.getErrorMsg()).isEqualTo("NullPointerException");

        // Job status should NOT toggle back to SCHEDULED! It retains its RUNNING status for retries
        verify(jobRepository, never()).save(testJob);
        assertThat(testJob.getStatus()).isEqualTo(JobStatus.RUNNING);
    }

    @Test
    void testProcessLifecycleEvent_Failed_CronJob_RetainsRunningStatusAndDoesNotResetToScheduled() {
        Job cronJob = Job.builder()
                .id("job-cron-003")
                .name("Cron Job")
                .scheduleType(ScheduleType.CRON)
                .status(JobStatus.RUNNING)
                .build();

        when(processedEventRepository.existsById("evt-cron-004")).thenReturn(false);
        when(jobRepository.findById("job-cron-003")).thenReturn(Optional.of(cronJob));
        JobRun existingRun = JobRun.builder()
                .runId("run-cron-003")
                .job(cronJob)
                .status(JobRunStatus.RUNNING)
                .attemptNumber(1)
                .build();
        when(jobRunRepository.findByRunId("run-cron-003")).thenReturn(Optional.of(existingRun));

        JobRunLifecycleEvent event = JobRunLifecycleEvent.builder()
                .eventId("evt-cron-004")
                .runId("run-cron-003")
                .jobId("job-cron-003")
                .status(JobRunStatus.FAILED)
                .attempt(1)
                .errorMsg("TimeoutException")
                .executionTimeMs(5000L)
                .timestamp(Instant.now())
                .build();

        persistenceService.processLifecycleEvent(event);

        verify(jobRunRepository).save(existingRun);
        assertThat(existingRun.getStatus()).isEqualTo(JobRunStatus.FAILED);

        // Job status should NOT toggle back to SCHEDULED during retries!
        verify(jobRepository, never()).save(cronJob);
        assertThat(cronJob.getStatus()).isEqualTo(JobStatus.RUNNING);
    }

    @Test
    void testProcessDeadEvent_OnceJob_SetsJobStatusToFailedPermanentlyAndSynchronizesRun() {
        when(jobRepository.findById("job-001")).thenReturn(Optional.of(testJob));
        JobRun runningRun = JobRun.builder()
                .runId("run-001")
                .job(testJob)
                .status(JobRunStatus.RUNNING)
                .attemptNumber(3)
                .build();
        when(jobRunRepository.findByRunId("run-001")).thenReturn(Optional.of(runningRun));

        JobDeadEvent event = JobDeadEvent.builder()
                .runId("run-001")
                .jobId("job-001")
                .attempt(3)
                .maxRetries(3)
                .errorMsg("Persistent error")
                .timestamp(Instant.now())
                .build();

        persistenceService.processDeadEvent(event);

        verify(jobRepository).save(testJob);
        assertThat(testJob.getStatus()).isEqualTo(JobStatus.FAILED_PERMANENTLY);

        // Verify running run was synchronized to FAILED
        verify(jobRunRepository).save(runningRun);
        assertThat(runningRun.getStatus()).isEqualTo(JobRunStatus.FAILED);
        assertThat(runningRun.getErrorMsg()).isEqualTo("Persistent error");
    }

    @Test
    void testProcessDeadEvent_CronJob_ResetsJobStatusToScheduledPhilosophyB() {
        Job cronJob = Job.builder()
                .id("job-cron-dead")
                .name("Cron Dead Job")
                .scheduleType(ScheduleType.CRON)
                .status(JobStatus.RUNNING)
                .build();

        when(jobRepository.findById("job-cron-dead")).thenReturn(Optional.of(cronJob));
        when(jobRunRepository.findByRunId("run-cron-dead")).thenReturn(Optional.empty());

        JobDeadEvent event = JobDeadEvent.builder()
                .runId("run-cron-dead")
                .jobId("job-cron-dead")
                .attempt(3)
                .maxRetries(3)
                .errorMsg("Database timeout")
                .timestamp(Instant.now())
                .build();

        persistenceService.processDeadEvent(event);

        // Philosophy B: Recurring job resets to SCHEDULED so future occurrences can run
        verify(jobRepository).save(cronJob);
        assertThat(cronJob.getStatus()).isEqualTo(JobStatus.SCHEDULED);

        // Upsert creates the JobRun with FAILED status
        ArgumentCaptor<JobRun> captor = ArgumentCaptor.forClass(JobRun.class);
        verify(jobRunRepository).save(captor.capture());
        JobRun savedRun = captor.getValue();
        assertThat(savedRun.getRunId()).isEqualTo("run-cron-dead");
        assertThat(savedRun.getStatus()).isEqualTo(JobRunStatus.FAILED);
        assertThat(savedRun.getErrorMsg()).isEqualTo("Database timeout");
    }

    @Test
    void testRaceCondition_CronJob_DeadEventArrivesBeforeDelayedRunningEvent_JobRemainsScheduled() {
        Job cronJob = Job.builder()
                .id("job-cron-race")
                .name("Cron Race Job")
                .scheduleType(ScheduleType.CRON)
                .status(JobStatus.RUNNING)
                .build();

        // 1. Dead event arrives FIRST and upserts JobRun as FAILED, resets cronJob to SCHEDULED
        when(jobRepository.findById("job-cron-race")).thenReturn(Optional.of(cronJob));
        when(jobRunRepository.findByRunId("run-cron-race")).thenReturn(Optional.empty());

        JobDeadEvent deadEvent = JobDeadEvent.builder()
                .runId("run-cron-race")
                .jobId("job-cron-race")
                .attempt(3)
                .maxRetries(3)
                .errorMsg("Fatal connection drop")
                .timestamp(Instant.now())
                .build();

        persistenceService.processDeadEvent(deadEvent);

        assertThat(cronJob.getStatus()).isEqualTo(JobStatus.SCHEDULED);

        // Now mock that findByRunId returns the upserted FAILED run
        JobRun deadRun = JobRun.builder()
                .runId("run-cron-race")
                .job(cronJob)
                .status(JobRunStatus.FAILED)
                .attemptNumber(3)
                .errorMsg("Fatal connection drop")
                .build();
        when(jobRunRepository.findByRunId("run-cron-race")).thenReturn(Optional.of(deadRun));
        when(processedEventRepository.existsById("evt-delayed-running")).thenReturn(false);

        // 2. Delayed RUNNING event arrives for the dead run
        JobRunLifecycleEvent delayedRunning = JobRunLifecycleEvent.builder()
                .eventId("evt-delayed-running")
                .runId("run-cron-race")
                .jobId("job-cron-race")
                .status(JobRunStatus.RUNNING)
                .attempt(3)
                .executorId("executor-8086")
                .timestamp(Instant.now())
                .build();

        persistenceService.processLifecycleEvent(delayedRunning);

        // Rule 1 intercepts the terminal FAILED run: cronJob MUST remain SCHEDULED, never resurrected to RUNNING!
        assertThat(cronJob.getStatus()).isEqualTo(JobStatus.SCHEDULED);
        assertThat(deadRun.getStatus()).isEqualTo(JobRunStatus.FAILED);
    }

    @Test
    void testRaceCondition_DeadEventArrivesBeforeDelayedRunningEvent_JobRemainsFailedPermanently() {
        testJob.setStatus(JobStatus.FAILED_PERMANENTLY);

        when(processedEventRepository.existsById("evt-late-running")).thenReturn(false);
        when(jobRepository.findById("job-001")).thenReturn(Optional.of(testJob));

        JobRun failedRun = JobRun.builder()
                .runId("run-001")
                .job(testJob)
                .status(JobRunStatus.FAILED)
                .attemptNumber(3)
                .errorMsg("Persistent error")
                .build();
        when(jobRunRepository.findByRunId("run-001")).thenReturn(Optional.of(failedRun));

        // Delayed RUNNING event arrives after Dead event was already processed
        JobRunLifecycleEvent lateRunningEvent = JobRunLifecycleEvent.builder()
                .eventId("evt-late-running")
                .runId("run-001")
                .jobId("job-001")
                .status(JobRunStatus.RUNNING)
                .attempt(3)
                .executorId("executor-8086")
                .timestamp(Instant.now())
                .build();

        persistenceService.processLifecycleEvent(lateRunningEvent);

        // Terminal state protection: Job must remain FAILED_PERMANENTLY and run must remain FAILED
        assertThat(testJob.getStatus()).isEqualTo(JobStatus.FAILED_PERMANENTLY);
        assertThat(failedRun.getStatus()).isEqualTo(JobRunStatus.FAILED);
    }

    @Test
    void testRaceCondition_DeadEventArrivesBeforeNewRunLifecycle_JobStatusNotOverwritten() {
        testJob.setStatus(JobStatus.FAILED_PERMANENTLY);

        when(processedEventRepository.existsById("evt-new-running")).thenReturn(false);
        when(jobRepository.findById("job-001")).thenReturn(Optional.of(testJob));
        when(jobRunRepository.findByRunId("run-new")).thenReturn(Optional.empty());

        JobRunLifecycleEvent newRunningEvent = JobRunLifecycleEvent.builder()
                .eventId("evt-new-running")
                .runId("run-new")
                .jobId("job-001")
                .status(JobRunStatus.RUNNING)
                .attempt(1)
                .executorId("executor-8086")
                .timestamp(Instant.now())
                .build();

        persistenceService.processLifecycleEvent(newRunningEvent);

        // JobRun is created for audit history
        ArgumentCaptor<JobRun> captor = ArgumentCaptor.forClass(JobRun.class);
        verify(jobRunRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(JobRunStatus.RUNNING);

        // But parent Job status must NEVER revert from FAILED_PERMANENTLY to RUNNING!
        assertThat(testJob.getStatus()).isEqualTo(JobStatus.FAILED_PERMANENTLY);
    }
}
