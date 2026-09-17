package com.zensys.watcher_service.kafka;

import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import com.zensys.watcher_service.event.JobRunEvent;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
@RequiredArgsConstructor
public class RunProducer {

    private final KafkaTemplate<String, JobRunEvent> kafkaTemplate;

    @Value("${watcher.run-topic:run}")
    private String runTopic;

    @Value("${watcher.kafka.send-timeout-seconds:5}")
    private long sendTimeoutSeconds;

    public void sendRunEvent(JobRunEvent event) {
        log.info("Publishing job run to Kafka topic '{}': jobId={}, runId={}", runTopic, event.getJobId(), event.getRunId());
        try {
            kafkaTemplate.send(
                    runTopic,
                    event.getJobId(),
                    event
            ).get(sendTimeoutSeconds, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Interrupted while waiting for Kafka ACK for runId=" + event.getRunId(), e);
        } catch (Exception e) {
            throw new RuntimeException("Failed to publish job run event to Kafka topic '" + runTopic + "' for runId="
                    + event.getRunId() + ": " + e.getMessage(), e);
        }
    }
}
