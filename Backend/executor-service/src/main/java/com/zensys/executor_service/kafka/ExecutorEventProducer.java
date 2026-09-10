package com.zensys.executor_service.kafka;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import com.zensys.executor_service.dto.JobDeadEvent;
import com.zensys.executor_service.dto.JobRetryEvent;
import com.zensys.executor_service.dto.JobRunLifecycleEvent;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
@RequiredArgsConstructor
public class ExecutorEventProducer {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Value("${job.run-events-topic:job-run-events}")
    private String runEventsTopic;

    @Value("${job.retry-topic:retry}")
    private String retryTopic;

    @Value("${job.dead-topic:dead}")
    private String deadTopic;

    public void publishLifecycleEvent(JobRunLifecycleEvent event) {
        log.info("Publishing lifecycle event to '{}': runId={}, status={}, eventId={}",
                runEventsTopic, event.getRunId(), event.getStatus(), event.getEventId());

        kafkaTemplate.send(runEventsTopic, event.getRunId(), event)
                .whenComplete((result, ex) -> {
                    if (ex != null) {
                        log.error("Failed to publish lifecycle event for runId={}: {}", event.getRunId(), ex.getMessage(), ex);
                    } else {
                        log.debug("Published lifecycle event for runId={} to partition={}",
                                event.getRunId(), result.getRecordMetadata().partition());
                    }
                });
    }

    public void publishRetryEvent(JobRetryEvent event) {
        log.info("Publishing retry event to '{}': jobId={}, runId={}, nextAttempt={}, delaySeconds={}",
                retryTopic, event.getJobId(), event.getRunId(), event.getAttempt(), event.getRetryDelaySeconds());

        kafkaTemplate.send(retryTopic, event.getJobId(), event)
                .whenComplete((result, ex) -> {
                    if (ex != null) {
                        log.error("Failed to publish retry event for runId={}: {}", event.getRunId(), ex.getMessage(), ex);
                    }
                });
    }

    public void publishDeadEvent(JobDeadEvent event) {
        log.warn("Publishing dead letter event to '{}': jobId={}, runId={}, error='{}'",
                deadTopic, event.getJobId(), event.getRunId(), event.getErrorMsg());

        kafkaTemplate.send(deadTopic, event.getJobId(), event)
                .whenComplete((result, ex) -> {
                    if (ex != null) {
                        log.error("Failed to publish dead event for runId={}: {}", event.getRunId(), ex.getMessage(), ex);
                    }
                });
    }
}
