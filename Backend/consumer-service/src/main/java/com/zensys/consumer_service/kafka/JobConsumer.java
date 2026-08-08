package com.zensys.consumer_service.kafka;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import com.zensys.consumer_service.event.JobCreatedEvent;
import com.zensys.consumer_service.service.JobPersistenceService;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class JobConsumer {

    private final JobPersistenceService jobPersistenceService;

    @KafkaListener(
            topics = "job-created",
            groupId = "job-consumer-group"
    )
    public void consume(JobCreatedEvent event) {

        jobPersistenceService.saveJob(event);
    }
}
