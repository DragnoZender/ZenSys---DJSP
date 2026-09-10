package com.zensys.executor_service.service;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.f4b6a3.ulid.UlidCreator;
import com.zensys.executor_service.dto.JobDeadEvent;
import com.zensys.executor_service.dto.JobExecutionRequest;
import com.zensys.executor_service.dto.JobRetryEvent;
import com.zensys.executor_service.dto.JobRunLifecycleEvent;
import com.zensys.executor_service.dto.JobRunStatus;
import com.zensys.executor_service.kafka.ExecutorEventProducer;
import com.zensys.executor_service.runner.TaskRunner;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class JobExecutionService {

    private final ExecutorEventProducer eventProducer;
    private final ExecutorHeartbeatService heartbeatService;
    private final TaskRunner taskRunner;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${executor.default-timeout-seconds:60}")
    private int defaultTimeoutSeconds;

    private ExecutorService workerPool;

    @PostConstruct
    public void init() {
        this.workerPool = Executors.newVirtualThreadPerTaskExecutor();
        log.info("Initialized executor with Java Virtual Threads (newVirtualThreadPerTaskExecutor)");
    }

    @PreDestroy
    public void shutdown() {
        if (workerPool != null) {
            workerPool.shutdown();
        }
    }

    public void submitJob(JobExecutionRequest request) {
        log.info("Submitting job for async execution: runId={}, jobId={}, attempt={}",
                request.getRunId(), request.getJobId(), request.getAttempt());

        // 1. Emit RUNNING lifecycle event to Kafka
        JobRunLifecycleEvent runningEvent = JobRunLifecycleEvent.builder()
                .eventId(UlidCreator.getUlid().toString())
                .runId(request.getRunId())
                .jobId(request.getJobId())
                .status(JobRunStatus.RUNNING)
                .attempt(request.getAttempt())
                .executorId(heartbeatService.getExecutorId())
                .timestamp(Instant.now())
                .build();

        eventProducer.publishLifecycleEvent(runningEvent);

        // 2. Resolve timeout from payload JSON or default
        int timeoutSeconds = resolveTimeout(request.getPayload());
        Instant startTime = Instant.now();

        // 3. Run asynchronously with hard timeout enforcement
        CompletableFuture.runAsync(() -> {
            try {
                taskRunner.execute(request);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }, workerPool)
                .orTimeout(timeoutSeconds, TimeUnit.SECONDS)
                .whenComplete((res, ex) -> {
                    long durationMs = Duration.between(startTime, Instant.now()).toMillis();

                    if (ex instanceof TimeoutException) {
                        handleTimeout(request, timeoutSeconds, durationMs);
                    } else if (ex != null) {
                        handleFailure(request, ex, durationMs);
                    } else {
                        handleSuccess(request, durationMs);
                    }
                });
    }

    private void handleSuccess(JobExecutionRequest request, long durationMs) {
        log.info("Job runId={} succeeded in {}ms", request.getRunId(), durationMs);

        JobRunLifecycleEvent successEvent = JobRunLifecycleEvent.builder()
                .eventId(UlidCreator.getUlid().toString())
                .runId(request.getRunId())
                .jobId(request.getJobId())
                .status(JobRunStatus.SUCCESS)
                .attempt(request.getAttempt())
                .executorId(heartbeatService.getExecutorId())
                .executionTimeMs(durationMs)
                .timestamp(Instant.now())
                .build();

        eventProducer.publishLifecycleEvent(successEvent);
    }

    private void handleTimeout(JobExecutionRequest request, int timeoutSeconds, long durationMs) {
        String errorMsg = "Execution timed out after " + timeoutSeconds + " seconds";
        log.warn("Job runId={} timed out (duration: {}ms)", request.getRunId(), durationMs);

        JobRunLifecycleEvent timeoutEvent = JobRunLifecycleEvent.builder()
                .eventId(UlidCreator.getUlid().toString())
                .runId(request.getRunId())
                .jobId(request.getJobId())
                .status(JobRunStatus.TIMEOUT)
                .attempt(request.getAttempt())
                .executorId(heartbeatService.getExecutorId())
                .errorMsg(errorMsg)
                .executionTimeMs(durationMs)
                .timestamp(Instant.now())
                .build();

        eventProducer.publishLifecycleEvent(timeoutEvent);
        handleRetryOrDead(request, errorMsg);
    }

    private void handleFailure(JobExecutionRequest request, Throwable ex, long durationMs) {
        String errorMsg = ex.getCause() != null ? ex.getCause().getMessage() : ex.getMessage();
        log.error("Job runId={} failed: {} (duration: {}ms)", request.getRunId(), errorMsg, durationMs);

        JobRunLifecycleEvent failedEvent = JobRunLifecycleEvent.builder()
                .eventId(UlidCreator.getUlid().toString())
                .runId(request.getRunId())
                .jobId(request.getJobId())
                .status(JobRunStatus.FAILED)
                .attempt(request.getAttempt())
                .executorId(heartbeatService.getExecutorId())
                .errorMsg(errorMsg)
                .executionTimeMs(durationMs)
                .timestamp(Instant.now())
                .build();

        eventProducer.publishLifecycleEvent(failedEvent);
        handleRetryOrDead(request, errorMsg);
    }

    private void handleRetryOrDead(JobExecutionRequest request, String errorMsg) {
        int attempt = request.getAttempt() != null ? request.getAttempt() : 1;
        int maxRetries = request.getMaxRetries() != null ? request.getMaxRetries() : 3;

        if (attempt < maxRetries) {
            // Exponential backoff: base (10s) * 2^(attempt)
            long delaySeconds = (long) (Math.pow(2, attempt) * 10);
            JobRetryEvent retryEvent = JobRetryEvent.builder()
                    .runId(request.getRunId())
                    .jobId(request.getJobId())
                    .payload(request.getPayload())
                    .attempt(attempt + 1)
                    .maxRetries(maxRetries)
                    .retryDelaySeconds(delaySeconds)
                    .errorMsg(errorMsg)
                    .timestamp(Instant.now())
                    .build();

            eventProducer.publishRetryEvent(retryEvent);
        } else {
            // All retry attempts exhausted -> publish to Dead Letter Queue (dead topic)
            JobDeadEvent deadEvent = JobDeadEvent.builder()
                    .runId(request.getRunId())
                    .jobId(request.getJobId())
                    .payload(request.getPayload())
                    .attempt(attempt)
                    .maxRetries(maxRetries)
                    .errorMsg(errorMsg)
                    .timestamp(Instant.now())
                    .build();

            eventProducer.publishDeadEvent(deadEvent);
        }
    }

    private int resolveTimeout(String payload) {
        if (payload != null && !payload.isBlank()) {
            try {
                JsonNode root = objectMapper.readTree(payload);
                if (root.has("timeoutSeconds") && root.get("timeoutSeconds").isInt()) {
                    int timeout = root.get("timeoutSeconds").asInt();
                    if (timeout > 0) {
                        return timeout;
                    }
                }
            } catch (Exception ignored) {
            }
        }
        return defaultTimeoutSeconds;
    }
}
