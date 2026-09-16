package com.zensys.job_consumer_service.kafka;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import com.zensys.job_consumer_service.dto.JobRunLifecycleEvent;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
@RequiredArgsConstructor
public class JobRunEventProducer {

    private final KafkaTemplate<String, JobRunLifecycleEvent> kafkaTemplate;

    @Value("${job.run-events-topic:job-run-events}")
    private String runEventsTopic;

    public void sendLifecycleEvent(JobRunLifecycleEvent event) {
        log.info("Publishing lifecycle event to Kafka topic '{}': runId={}, status={}, eventId={}",
                runEventsTopic, event.getRunId(), event.getStatus(), event.getEventId());

        kafkaTemplate.send(
                runEventsTopic,
                event.getRunId(), // Partition key for FIFO ordering
                event
            ).whenComplete((result, ex) -> {
                    if (ex != null) {
                        log.error("Failed to publish lifecycle event for runId={}: {}", event.getRunId(),
                                ex.getMessage(), ex);
                    } else {
                        log.debug("Successfully published lifecycle event for runId={} to partition={}",
                                event.getRunId(), result.getRecordMetadata().partition());
                    }
                });
    }
}
