package com.zensys.watcher_service.service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.github.f4b6a3.ulid.UlidCreator;
import com.zensys.watcher_service.event.JobDeadEvent;
import com.zensys.watcher_service.event.JobRetryEvent;
import com.zensys.watcher_service.event.JobRunLifecycleEvent;
import com.zensys.watcher_service.kafka.ExecutorRecoveryProducer;
import com.zensys.watcher_service.model.Job;
import com.zensys.watcher_service.model.JobRun;
import com.zensys.watcher_service.model.JobRunStatus;
import com.zensys.watcher_service.repository.JobRunRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class ExecutorLivenessWatcher {

    private final JobRunRepository jobRunRepository;
    private final StringRedisTemplate redisTemplate;
    private final ExecutorRecoveryProducer recoveryProducer;

    @Value("${watcher.zombie-sweeper.threshold-seconds:60}")
    private long heartbeatTimeoutSeconds;

    @Value("${watcher.zombie-sweeper.batch-size:100}")
    private int batchSize;

    static int i = 0;

    @Scheduled(fixedDelayString = "${watcher.zombie-sweeper.interval-ms:20000}")
    public void scanAndRecoverOrphanedRuns() {
        System.out.println("\n\n Iteration count = " + (i++) + "\n\n");
        try {
            Instant threshold = Instant.now().minusSeconds(heartbeatTimeoutSeconds);
            List<JobRun> staleRuns = jobRunRepository.findStaleRunningRuns(threshold, PageRequest.of(0, batchSize));

            if (staleRuns.isEmpty()) {
                log.trace("No stale running runs detected older than {}s", heartbeatTimeoutSeconds);
                return;
            }

            log.info("Found {} in-flight run(s) older than {}s to verify liveness", staleRuns.size(),
                    heartbeatTimeoutSeconds);

            for (JobRun run : staleRuns) {
                try {
                    verifyAndRecover(run);
                } catch (Exception e) {
                    log.error("Failed to recover orphaned runId={}: {}", run.getRunId(), e.getMessage(), e);
                }
            }
        } catch (Exception e) {
            log.error("Unexpected error in zombie sweeper cycle: {}", e.getMessage(), e);
        }
    }

    void verifyAndRecover(JobRun run) {
        String executorId = run.getExecutorId();
        String heartbeatKey = "executor:" + executorId + ":heartbeat";

        // 1. Check Dead Man's Switch in Redis
        Boolean isAlive = redisTemplate.hasKey(heartbeatKey);
        if (Boolean.TRUE.equals(isAlive)) {
            // Executor is actively pulsing heartbeats; job is progressing normally
            log.trace("Executor '{}' is alive in Redis. RunId={} is active.", executorId, run.getRunId());
            return;
        }

        // 2. Dead Man's Switch tripped! Acquire multi-watcher recovery lock
        String lockKey = "lock:recover:" + run.getRunId();
        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(lockKey, "1", Duration.ofMinutes(2));
        if (!Boolean.TRUE.equals(acquired)) {
            log.debug("RunId={} is already being recovered by another watcher instance", run.getRunId());
            return;
        }

        log.warn(
                "Dead Man's Switch tripped! Executor '{}' heartbeat missing in Redis. Recovering orphaned runId={} (jobId={})",
                executorId, run.getRunId(), run.getJob().getId());

        Job job = run.getJob();
        int currentAttempt = run.getAttemptNumber() != null ? run.getAttemptNumber() : 1;
        int maxRetries = job.getRetries() != null ? job.getRetries() : 3;
        String errorMsg = "Executor '" + executorId + "' died mid-job (heartbeat lost in Redis)";

        // 3. Fail-safe ordering: Send retry/dead first, then lifecycle event
        if (currentAttempt < maxRetries) {
            // Exponential backoff: base 10s * 2^(currentAttempt)
            long delaySeconds = (long) (Math.pow(2, currentAttempt) * 10);
            JobRetryEvent retryEvent = JobRetryEvent.builder()
                    .runId(run.getRunId())
                    .jobId(job.getId())
                    .payload(job.getPayload())
                    .attempt(currentAttempt + 1)
                    .maxRetries(maxRetries)
                    .retryDelaySeconds(delaySeconds)
                    .errorMsg(errorMsg)
                    .timestamp(Instant.now())
                    .build();

            recoveryProducer.sendRetryEvent(retryEvent);
            log.info("Dispatched retry event for orphaned runId={}, nextAttempt={}", run.getRunId(),
                    currentAttempt + 1);
        } else {
            // Retries exhausted -> Dead letter queue
            JobDeadEvent deadEvent = JobDeadEvent.builder()
                    .runId(run.getRunId())
                    .jobId(job.getId())
                    .payload(job.getPayload())
                    .attempt(currentAttempt)
                    .maxRetries(maxRetries)
                    .errorMsg(errorMsg)
                    .timestamp(Instant.now())
                    .build();

            recoveryProducer.sendDeadEvent(deadEvent);
            log.warn("Retries exhausted for orphaned runId={}; dispatched dead letter event", run.getRunId());
        }

        // 4. Send lifecycle failure event to consumer-service to record EXECUTOR_DIED
        // in PostgreSQL
        JobRunLifecycleEvent failureEvent = JobRunLifecycleEvent.builder()
                .eventId(UlidCreator.getUlid().toString())
                .runId(run.getRunId())
                .jobId(job.getId())
                .status(JobRunStatus.EXECUTOR_DIED)
                .attempt(currentAttempt)
                .executorId(executorId)
                .errorMsg(errorMsg)
                .timestamp(Instant.now())
                .build();

        recoveryProducer.sendLifecycleEvent(failureEvent);
        log.info("Dispatched EXECUTOR_DIED lifecycle event for runId={}", run.getRunId());
    }
}
