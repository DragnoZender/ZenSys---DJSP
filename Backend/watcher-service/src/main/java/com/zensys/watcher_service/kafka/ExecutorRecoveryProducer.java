package com.zensys.watcher_service.kafka;

import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import com.zensys.watcher_service.event.JobDeadEvent;
import com.zensys.watcher_service.event.JobRetryEvent;
import com.zensys.watcher_service.event.JobRunLifecycleEvent;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
@RequiredArgsConstructor
public class ExecutorRecoveryProducer {

    @SuppressWarnings("rawtypes")
    private final KafkaTemplate kafkaTemplate;

    @Value("${watcher.retry-topic:retry}")
    private String retryTopic;

    @Value("${watcher.job-run-events-topic:job-run-events}")
    private String jobRunEventsTopic;

    @Value("${watcher.dead-topic:dead}")
    private String deadTopic;

    @Value("${watcher.kafka.send-timeout-seconds:5}")
    private long sendTimeoutSeconds;

    @SuppressWarnings("unchecked")
    public void sendRetryEvent(JobRetryEvent event) {
        log.info("Publishing recovery retry event to topic '{}': jobId={}, runId={}, nextAttempt={}",
                retryTopic, event.getJobId(), event.getRunId(), event.getAttempt());
        try {
            kafkaTemplate.send(retryTopic, event.getJobId(), event)
                    .get(sendTimeoutSeconds, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Interrupted while waiting for Kafka ACK on retry topic", e);
        } catch (Exception e) {
            throw new RuntimeException("Failed to send retry event for jobId=" + event.getJobId() + ": " + e.getMessage(), e);
        }
    }

    @SuppressWarnings("unchecked")
    public void sendDeadEvent(JobDeadEvent event) {
        log.warn("Publishing recovery dead letter event to topic '{}': jobId={}, runId={}, attempt={}",
                deadTopic, event.getJobId(), event.getRunId(), event.getAttempt());
        try {
            kafkaTemplate.send(deadTopic, event.getJobId(), event)
                    .get(sendTimeoutSeconds, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Interrupted while waiting for Kafka ACK on dead topic", e);
        } catch (Exception e) {
            throw new RuntimeException("Failed to send dead event for jobId=" + event.getJobId() + ": " + e.getMessage(), e);
        }
    }

    @SuppressWarnings("unchecked")
    public void sendLifecycleEvent(JobRunLifecycleEvent event) {
        log.info("Publishing recovery lifecycle event to topic '{}': runId={}, status={}",
                jobRunEventsTopic, event.getRunId(), event.getStatus());
        try {
            kafkaTemplate.send(jobRunEventsTopic, event.getRunId(), event)
                    .get(sendTimeoutSeconds, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Interrupted while waiting for Kafka ACK on lifecycle topic", e);
        } catch (Exception e) {
            throw new RuntimeException("Failed to send lifecycle event for runId=" + event.getRunId() + ": " + e.getMessage(), e);
        }
    }
}
