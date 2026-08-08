package com.zensys.job_service.kafka;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import com.zensys.job_service.event.JobCreatedEvent;

@Component
public class JobProducer {

    @Autowired
    private KafkaTemplate<String, JobCreatedEvent> kafkaTemplate;

    private static final String JOB_CREATED_TOPIC = "job-created";

    public void sendJobCreatedEvent(JobCreatedEvent event) {

        kafkaTemplate.send(
                JOB_CREATED_TOPIC,
                event
        );
    }
}