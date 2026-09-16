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
    void testProcessDeadEvent_SetsJobStatusToFailedPermanently() {
        when(jobRepository.findById("job-001")).thenReturn(Optional.of(testJob));

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
    }
}
