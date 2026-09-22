package com.zensys.watcher_service.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import com.zensys.watcher_service.event.JobDeadEvent;
import com.zensys.watcher_service.event.JobRetryEvent;
import com.zensys.watcher_service.event.JobRunLifecycleEvent;
import com.zensys.watcher_service.kafka.ExecutorRecoveryProducer;
import com.zensys.watcher_service.model.Job;
import com.zensys.watcher_service.model.JobRun;
import com.zensys.watcher_service.model.JobRunStatus;
import com.zensys.watcher_service.repository.JobRunRepository;

@ExtendWith(MockitoExtension.class)
class ExecutorLivenessWatcherTest {

        @Mock
        private JobRunRepository jobRunRepository;

        @Mock
        private StringRedisTemplate redisTemplate;

        @Mock
        private ValueOperations<String, String> valueOperations;

        @Mock
        private ExecutorRecoveryProducer recoveryProducer;

        @InjectMocks
        private ExecutorLivenessWatcher livenessWatcher;

        @BeforeEach
        void setUp() {
                ReflectionTestUtils.setField(livenessWatcher, "heartbeatTimeoutSeconds", 60L);
                ReflectionTestUtils.setField(livenessWatcher, "batchSize", 100);
        }

        @Test
        @DisplayName("Should do nothing when no stale runs found")
        void testScan_NoStaleRuns() {
                when(jobRunRepository.findStaleRunningRuns(any(Instant.class), any(Pageable.class)))
                                .thenReturn(List.of());

                livenessWatcher.scanAndRecoverOrphanedRuns();

                verify(redisTemplate, never()).hasKey(anyString());
                verify(recoveryProducer, never()).sendRetryEvent(any());
                verify(recoveryProducer, never()).sendLifecycleEvent(any());
        }

        @Test
        @DisplayName("Should skip recovery when executor heartbeat key exists in Redis (alive)")
        void testScan_ExecutorAlive() {
                Job job = Job.builder().id("job-1").retries(3).build();
                JobRun run = JobRun.builder()
                                .runId("run-1")
                                .job(job)
                                .executorId("executor-8086")
                                .status(JobRunStatus.RUNNING)
                                .attemptNumber(1)
                                .build();

                when(jobRunRepository.findStaleRunningRuns(any(Instant.class), any(Pageable.class)))
                                .thenReturn(List.of(run));
                when(redisTemplate.hasKey("executor:executor-8086:heartbeat")).thenReturn(Boolean.TRUE);

                livenessWatcher.scanAndRecoverOrphanedRuns();

                verify(recoveryProducer, never()).sendRetryEvent(any());
                verify(recoveryProducer, never()).sendDeadEvent(any());
                verify(recoveryProducer, never()).sendLifecycleEvent(any());
        }

        @Test
        @DisplayName("Should recover orphaned run when executor is dead and attempt < maxRetries")
        void testScan_ExecutorDead_TriggersRetry() {
                Job job = Job.builder().id("job-1").payload("{\"task\":1}").retries(3).build();
                JobRun run = JobRun.builder()
                                .runId("run-101")
                                .job(job)
                                .executorId("executor-8086")
                                .status(JobRunStatus.RUNNING)
                                .attemptNumber(1)
                                .build();

                when(jobRunRepository.findStaleRunningRuns(any(Instant.class), any(Pageable.class)))
                                .thenReturn(List.of(run));
                when(redisTemplate.hasKey("executor:executor-8086:heartbeat")).thenReturn(Boolean.FALSE);
                when(redisTemplate.opsForValue()).thenReturn(valueOperations);
                when(valueOperations.setIfAbsent(eq("lock:recover:run-101"), eq("1"), any(Duration.class)))
                                .thenReturn(Boolean.TRUE);

                livenessWatcher.scanAndRecoverOrphanedRuns();

                // 1. Verify retry event sent with attempt 2
                ArgumentCaptor<JobRetryEvent> retryCaptor = ArgumentCaptor.forClass(JobRetryEvent.class);
                verify(recoveryProducer, times(1)).sendRetryEvent(retryCaptor.capture());
                JobRetryEvent retryEvent = retryCaptor.getValue();
                assertThat(retryEvent.getRunId()).isEqualTo("run-101");
                assertThat(retryEvent.getJobId()).isEqualTo("job-1");
                assertThat(retryEvent.getAttempt()).isEqualTo(2);
                assertThat(retryEvent.getMaxRetries()).isEqualTo(3);
                assertThat(retryEvent.getRetryDelaySeconds()).isEqualTo(20L); // 10 * 2^1 = 20

                // 2. Verify lifecycle EXECUTOR_DIED event sent
                ArgumentCaptor<JobRunLifecycleEvent> lifecycleCaptor = ArgumentCaptor
                                .forClass(JobRunLifecycleEvent.class);
                verify(recoveryProducer, times(1)).sendLifecycleEvent(lifecycleCaptor.capture());
                JobRunLifecycleEvent lifecycleEvent = lifecycleCaptor.getValue();
                assertThat(lifecycleEvent.getRunId()).isEqualTo("run-101");
                assertThat(lifecycleEvent.getStatus()).isEqualTo(JobRunStatus.EXECUTOR_DIED);
                assertThat(lifecycleEvent.getErrorMsg()).contains("executor-8086");

                verify(recoveryProducer, never()).sendDeadEvent(any());
        }

        @Test
        @DisplayName("Should send dead letter event when executor is dead and attempt >= maxRetries")
        void testScan_ExecutorDead_RetriesExhausted_SendsDeadEvent() {
                Job job = Job.builder().id("job-1").payload("{\"task\":1}").retries(3).build();
                JobRun run = JobRun.builder()
                                .runId("run-103")
                                .job(job)
                                .executorId("executor-8086")
                                .status(JobRunStatus.RUNNING)
                                .attemptNumber(3) // Last attempt
                                .build();

                when(jobRunRepository.findStaleRunningRuns(any(Instant.class), any(Pageable.class)))
                                .thenReturn(List.of(run));
                when(redisTemplate.hasKey("executor:executor-8086:heartbeat")).thenReturn(Boolean.FALSE);
                when(redisTemplate.opsForValue()).thenReturn(valueOperations);
                when(valueOperations.setIfAbsent(eq("lock:recover:run-103"), eq("1"), any(Duration.class)))
                                .thenReturn(Boolean.TRUE);

                livenessWatcher.scanAndRecoverOrphanedRuns();

                // 1. Verify dead event sent
                ArgumentCaptor<JobDeadEvent> deadCaptor = ArgumentCaptor.forClass(JobDeadEvent.class);
                verify(recoveryProducer, times(1)).sendDeadEvent(deadCaptor.capture());
                JobDeadEvent deadEvent = deadCaptor.getValue();
                assertThat(deadEvent.getRunId()).isEqualTo("run-103");
                assertThat(deadEvent.getJobId()).isEqualTo("job-1");
                assertThat(deadEvent.getAttempt()).isEqualTo(3);
                assertThat(deadEvent.getMaxRetries()).isEqualTo(3);

                // 2. Verify lifecycle EXECUTOR_DIED event sent
                verify(recoveryProducer, times(1)).sendLifecycleEvent(any());
                verify(recoveryProducer, never()).sendRetryEvent(any());
        }

        @Test
        @DisplayName("Should skip when another watcher instance holds the recovery lock")
        void testScan_LockNotAcquired() {
                Job job = Job.builder().id("job-1").retries(3).build();
                JobRun run = JobRun.builder()
                                .runId("run-101")
                                .job(job)
                                .executorId("executor-8086")
                                .status(JobRunStatus.RUNNING)
                                .attemptNumber(1)
                                .build();

                when(jobRunRepository.findStaleRunningRuns(any(Instant.class), any(Pageable.class)))
                                .thenReturn(List.of(run));
                when(redisTemplate.hasKey("executor:executor-8086:heartbeat")).thenReturn(Boolean.FALSE);
                when(redisTemplate.opsForValue()).thenReturn(valueOperations);
                // Lock already held by another watcher node
                when(valueOperations.setIfAbsent(eq("lock:recover:run-101"), eq("1"), any(Duration.class)))
                                .thenReturn(Boolean.FALSE);

                livenessWatcher.scanAndRecoverOrphanedRuns();

                verify(recoveryProducer, never()).sendRetryEvent(any());
                verify(recoveryProducer, never()).sendDeadEvent(any());
                verify(recoveryProducer, never()).sendLifecycleEvent(any());
        }
}
