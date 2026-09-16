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
import com.zensys.consumer_service.model.ScheduleType;
import com.zensys.consumer_service.repository.JobRepository;
import com.zensys.consumer_service.repository.JobRunRepository;

@ExtendWith(MockitoExtension.class)
class JobRunPersistenceServiceTest {

    @Mock
    private JobRepository jobRepository;

    @Mock
    private JobRunRepository jobRunRepository;

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

    @Test
    void testProcessLifecycleEvent_Pending_CreatesNewJobRun() {
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
    }

    @Test
    void testProcessLifecycleEvent_Pending_DuplicateSkipped() {
        when(jobRepository.findById("job-001")).thenReturn(Optional.of(testJob));
        JobRun existingRun = JobRun.builder()
                .runId("run-001")
                .status(JobRunStatus.PENDING)
                .build();
        when(jobRunRepository.findByRunId("run-001")).thenReturn(Optional.of(existingRun));

        JobRunLifecycleEvent event = JobRunLifecycleEvent.builder()
                .runId("run-001")
                .jobId("job-001")
                .status(JobRunStatus.PENDING)
                .attempt(1)
                .build();

        persistenceService.processLifecycleEvent(event);

        verify(jobRunRepository, never()).save(any());
    }

    @Test
    void testProcessLifecycleEvent_Running_UpdatesRunAndJobStatus() {
        when(jobRepository.findById("job-001")).thenReturn(Optional.of(testJob));
        JobRun existingRun = JobRun.builder()
                .runId("run-001")
                .job(testJob)
                .status(JobRunStatus.PENDING)
                .attemptNumber(1)
                .build();
        when(jobRunRepository.findByRunId("run-001")).thenReturn(Optional.of(existingRun));

        JobRunLifecycleEvent event = JobRunLifecycleEvent.builder()
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
    void testProcessLifecycleEvent_Success_UpdatesRunAndResetsJobStatus() {
        when(jobRepository.findById("job-001")).thenReturn(Optional.of(testJob));
        JobRun existingRun = JobRun.builder()
                .runId("run-001")
                .job(testJob)
                .status(JobRunStatus.RUNNING)
                .attemptNumber(1)
                .build();
        when(jobRunRepository.findByRunId("run-001")).thenReturn(Optional.of(existingRun));

        JobRunLifecycleEvent event = JobRunLifecycleEvent.builder()
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
        assertThat(testJob.getStatus()).isEqualTo(JobStatus.SCHEDULED);
    }

    @Test
    void testProcessLifecycleEvent_Failed_UpdatesRunAndSetsJobScheduled() {
        when(jobRepository.findById("job-001")).thenReturn(Optional.of(testJob));
        JobRun existingRun = JobRun.builder()
                .runId("run-001")
                .job(testJob)
                .status(JobRunStatus.RUNNING)
                .attemptNumber(1)
                .build();
        when(jobRunRepository.findByRunId("run-001")).thenReturn(Optional.of(existingRun));

        JobRunLifecycleEvent event = JobRunLifecycleEvent.builder()
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

        verify(jobRepository).save(testJob);
        assertThat(testJob.getStatus()).isEqualTo(JobStatus.SCHEDULED);
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
