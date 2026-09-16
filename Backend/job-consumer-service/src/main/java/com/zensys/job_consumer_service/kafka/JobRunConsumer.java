package com.zensys.job_consumer_service.kafka;

import java.time.Instant;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import com.github.f4b6a3.ulid.UlidCreator;
import com.zensys.job_consumer_service.client.ExecutorClient;
import com.zensys.job_consumer_service.dto.JobExecutionRequest;
import com.zensys.job_consumer_service.dto.JobRunLifecycleEvent;
import com.zensys.job_consumer_service.dto.JobRunMessage;
import com.zensys.job_consumer_service.dto.JobRunStatus;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
@RequiredArgsConstructor
public class JobRunConsumer {

    private final JobRunEventProducer eventProducer;
    private final ExecutorClient executorClient;

    @KafkaListener(topics = "${job.run-topic:run}", groupId = "${spring.kafka.consumer.group-id:job-consumer-service-group}")
    public void consume(JobRunMessage message) {
        log.info("Received job execution message from 'run' topic: runId={}, jobId={}, attempt={}",
                message.getRunId(), message.getJobId(), message.getAttempt());

        // 1. Emit PENDING lifecycle event so consumer-service creates the job_runs
        // record
        JobRunLifecycleEvent pendingEvent = JobRunLifecycleEvent.builder()
                .eventId(UlidCreator.getUlid().toString())
                .runId(message.getRunId())
                .jobId(message.getJobId())
                .status(JobRunStatus.PENDING)
                .attempt(message.getAttempt())
                .scheduledAt(message.getScheduledAt())
                .timestamp(Instant.now())
                .build();

        eventProducer.sendLifecycleEvent(pendingEvent);

        // 2. Dispatch execution request to executor-service via OpenFeign
        try {
            JobExecutionRequest request = JobExecutionRequest.builder()
                    .runId(message.getRunId())
                    .jobId(message.getJobId())
                    .payload(message.getPayload())
                    .attempt(message.getAttempt())
                    .maxRetries(message.getMaxRetries())
                    .build();

            log.info("Dispatching runId={} to executor-service...", message.getRunId());
            executorClient.executeJob(request);
            log.info("Successfully dispatched runId={} to executor-service", message.getRunId());
        } catch (Exception e) {
            log.warn("Failed to dispatch runId={} to executor-service: {}", message.getRunId(), e.getMessage());
            // Note: Once retry-service/DLQ is configured, dispatch failures can be routed
            // to the 'retry' topic
        }
    }
}
