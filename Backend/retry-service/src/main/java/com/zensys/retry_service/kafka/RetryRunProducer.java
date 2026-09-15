package com.zensys.retry_service.kafka;

import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;

import com.zensys.retry_service.dto.JobRunMessage;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
@RequiredArgsConstructor
public class RetryRunProducer {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Value("${job.run-topic:run}")
    private String runTopic;

    public boolean publishToRunTopic(JobRunMessage message) {
        log.info("Publishing retried run to topic '{}': jobId={}, runId={}, attempt={}",
                runTopic, message.getJobId(), message.getRunId(), message.getAttempt());

        try {
            SendResult<String, Object> result = kafkaTemplate.send(runTopic, message.getJobId(), message)
                    .get(5, TimeUnit.SECONDS);

            log.debug("Successfully published retried runId={} to partition={}",
                    message.getRunId(), result.getRecordMetadata().partition());
            return true;
        } catch (Exception ex) {
            log.error("Failed to publish retried runId={} for jobId={}: {}",
                    message.getRunId(), message.getJobId(), ex.getMessage(), ex);
            return false;
        }
    }
}
