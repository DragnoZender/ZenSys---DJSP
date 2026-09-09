package com.zensys.watcher_service.kafka;

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

    public void sendRunEvent(JobRunEvent event) {
        log.info("Publishing job run to Kafka topic '{}': jobId={}, runId={}", runTopic, event.getJobId(), event.getRunId());
        kafkaTemplate.send(
                runTopic,
                event.getJobId(),
                event
        );
    }
}
