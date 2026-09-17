package com.zensys.watcher_service.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.function.Consumer;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.zensys.watcher_service.event.JobRunEvent;
import com.zensys.watcher_service.kafka.RunProducer;
import com.zensys.watcher_service.model.Job;
import com.zensys.watcher_service.model.JobStatus;
import com.zensys.watcher_service.model.ScheduleType;

@ExtendWith(MockitoExtension.class)
class JobWatcherServiceTest {

    @Mock
    private JobTransactionService jobTransactionService;

    @Mock
    private RunProducer runProducer;

    @InjectMocks
    private JobWatcherService jobWatcherService;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(jobWatcherService, "batchSize", 1000);
        ReflectionTestUtils.setField(jobWatcherService, "lockThresholdSeconds", 30L);
    }

    @Test
    @DisplayName("Should do nothing when no due jobs found")
    void testPollAndDispatch_NoJobs() {
        when(jobTransactionService.claimDueJobs(any(Instant.class), any(Instant.class), anyInt()))
                .thenReturn(List.of());

        jobWatcherService.pollAndDispatchDueJobs();

        verify(runProducer, never()).sendRunEvent(any());
        verify(jobTransactionService, never()).advanceAndSaveJob(any(), any());
    }

    @Test
    @DisplayName("Should dispatch ONCE job, mark RUNNING, clear nextRunTime, and save")
    void testPollAndDispatch_OnceJob() {
        Instant now = Instant.now();
        Job job = Job.builder()
                .id("job-once-1")
                .name("Once Job")
                .scheduleType(ScheduleType.ONCE)
                .status(JobStatus.SCHEDULED)
                .nextRunTime(now.minusSeconds(10))
                .retries(3)
                .payload("{\"key\":\"value\"}")
                .build();

        when(jobTransactionService.claimDueJobs(any(Instant.class), any(Instant.class), anyInt()))
                .thenReturn(List.of(job));

        doAnswer(invocation -> {
            Consumer<Job> advancer = invocation.getArgument(1);
            advancer.accept(job);
            return job;
        }).when(jobTransactionService).advanceAndSaveJob(eq("job-once-1"), any());

        jobWatcherService.pollAndDispatchDueJobs();

        ArgumentCaptor<JobRunEvent> eventCaptor = ArgumentCaptor.forClass(JobRunEvent.class);
        verify(runProducer, times(1)).sendRunEvent(eventCaptor.capture());

        JobRunEvent sentEvent = eventCaptor.getValue();
        assertThat(sentEvent.getJobId()).isEqualTo("job-once-1");
        assertThat(sentEvent.getRunId()).isNotNull();
        assertThat(sentEvent.getAttempt()).isEqualTo(1);
        assertThat(sentEvent.getMaxRetries()).isEqualTo(3);
        assertThat(sentEvent.getPayload()).isEqualTo("{\"key\":\"value\"}");

        verify(jobTransactionService, times(1)).advanceAndSaveJob(eq("job-once-1"), any());
        assertThat(job.getStatus()).isEqualTo(JobStatus.RUNNING);
        assertThat(job.getNextRunTime()).isNull();
    }

    @Test
    @DisplayName("Should dispatch INTERVAL job, calculate next occurrence, and save")
    void testPollAndDispatch_IntervalJob() {
        Instant now = Instant.now();
        Job job = Job.builder()
                .id("job-interval-1")
                .name("Interval Job")
                .scheduleType(ScheduleType.INTERVAL)
                .status(JobStatus.SCHEDULED)
                .nextRunTime(now.minusSeconds(5))
                .meta("{\"intervalSeconds\":120}")
                .retries(2)
                .payload("{\"test\":1}")
                .build();

        when(jobTransactionService.claimDueJobs(any(Instant.class), any(Instant.class), anyInt()))
                .thenReturn(List.of(job));

        doAnswer(invocation -> {
            Consumer<Job> advancer = invocation.getArgument(1);
            advancer.accept(job);
            return job;
        }).when(jobTransactionService).advanceAndSaveJob(eq("job-interval-1"), any());

        jobWatcherService.pollAndDispatchDueJobs();

        verify(runProducer, times(1)).sendRunEvent(any());
        verify(jobTransactionService, times(1)).advanceAndSaveJob(eq("job-interval-1"), any());
        assertThat(job.getStatus()).isEqualTo(JobStatus.RUNNING);
        assertThat(job.getNextRunTime()).isAfter(now);
    }

    @Test
    @DisplayName("Should dispatch CRON job, calculate next occurrence, and save")
    void testPollAndDispatch_CronJob() {
        Instant now = Instant.now();
        Job job = Job.builder()
                .id("job-cron-1")
                .name("Cron Job")
                .scheduleType(ScheduleType.CRON)
                .status(JobStatus.SCHEDULED)
                .nextRunTime(now.minusSeconds(5))
                .cronExpression("0 * * * * *") // every minute
                .retries(2)
                .build();

        when(jobTransactionService.claimDueJobs(any(Instant.class), any(Instant.class), anyInt()))
                .thenReturn(List.of(job));

        doAnswer(invocation -> {
            Consumer<Job> advancer = invocation.getArgument(1);
            advancer.accept(job);
            return job;
        }).when(jobTransactionService).advanceAndSaveJob(eq("job-cron-1"), any());

        jobWatcherService.pollAndDispatchDueJobs();

        verify(runProducer, times(1)).sendRunEvent(any());
        verify(jobTransactionService, times(1)).advanceAndSaveJob(eq("job-cron-1"), any());
        assertThat(job.getStatus()).isEqualTo(JobStatus.RUNNING);
        assertThat(job.getNextRunTime()).isAfter(now);
    }

    @Test
    @DisplayName("Should release lease and NOT advance schedule when Kafka send fails")
    void testPollAndDispatch_KafkaFailure_ReleasesLeaseAndDoesNotAdvance() {
        Instant now = Instant.now();
        Instant originalNextRunTime = now.minusSeconds(10);
        Job job = Job.builder()
                .id("job-fail-1")
                .name("Failing Kafka Job")
                .scheduleType(ScheduleType.ONCE)
                .status(JobStatus.SCHEDULED)
                .nextRunTime(originalNextRunTime)
                .retries(3)
                .build();

        when(jobTransactionService.claimDueJobs(any(Instant.class), any(Instant.class), anyInt()))
                .thenReturn(List.of(job));

        doThrow(new RuntimeException("Kafka broker unreachable"))
                .when(runProducer).sendRunEvent(any());

        jobWatcherService.pollAndDispatchDueJobs();

        verify(runProducer, times(1)).sendRunEvent(any());
        // Crucial guarantee: schedule is NOT advanced and lease is immediately released
        verify(jobTransactionService, never()).advanceAndSaveJob(any(), any());
        verify(jobTransactionService, times(1)).releaseJobLease(eq("job-fail-1"));
        assertThat(job.getStatus()).isEqualTo(JobStatus.SCHEDULED);
        assertThat(job.getNextRunTime()).isEqualTo(originalNextRunTime);
    }

    @Test
    @DisplayName("Should process successful jobs even if one job fails in Kafka")
    void testPollAndDispatch_PartialKafkaFailure() {
        Instant now = Instant.now();
        Job job1 = Job.builder()
                .id("job-1")
                .name("Job 1")
                .scheduleType(ScheduleType.ONCE)
                .status(JobStatus.SCHEDULED)
                .nextRunTime(now.minusSeconds(10))
                .build();

        Job job2 = Job.builder()
                .id("job-2")
                .name("Job 2")
                .scheduleType(ScheduleType.ONCE)
                .status(JobStatus.SCHEDULED)
                .nextRunTime(now.minusSeconds(10))
                .build();

        when(jobTransactionService.claimDueJobs(any(Instant.class), any(Instant.class), anyInt()))
                .thenReturn(List.of(job1, job2));

        // Job 1 fails Kafka, Job 2 succeeds
        doThrow(new RuntimeException("Kafka timeout on job 1"))
                .when(runProducer).sendRunEvent(argThat(event -> event != null && "job-1".equals(event.getJobId())));

        doAnswer(invocation -> {
            Consumer<Job> advancer = invocation.getArgument(1);
            advancer.accept(job2);
            return job2;
        }).when(jobTransactionService).advanceAndSaveJob(eq("job-2"), any());

        jobWatcherService.pollAndDispatchDueJobs();

        // Job 1 should have lease released, but NOT advanced
        verify(jobTransactionService, times(1)).releaseJobLease(eq("job-1"));
        verify(jobTransactionService, never()).advanceAndSaveJob(eq("job-1"), any());

        // Job 2 should be advanced and saved
        verify(jobTransactionService, times(1)).advanceAndSaveJob(eq("job-2"), any());
        assertThat(job2.getStatus()).isEqualTo(JobStatus.RUNNING);
        assertThat(job2.getNextRunTime()).isNull();
    }
}
