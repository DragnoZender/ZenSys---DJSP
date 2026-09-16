package com.zensys.consumer_service.kafka;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import com.zensys.consumer_service.event.JobDeadEvent;
import com.zensys.consumer_service.event.JobRunLifecycleEvent;
import com.zensys.consumer_service.service.JobRunPersistenceService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
@RequiredArgsConstructor
public class JobRunEventConsumer {

    private final JobRunPersistenceService persistenceService;

    @KafkaListener(
            topics = "${job.run-events-topic:job-run-events}",
            groupId = "job-run-events-consumer-group",
            containerFactory = "jobRunEventListenerContainerFactory"
    )
    public void consumeLifecycleEvent(JobRunLifecycleEvent event) {
        log.info("Received lifecycle event: runId={}, jobId={}, status={}, attempt={}",
                event.getRunId(), event.getJobId(), event.getStatus(), event.getAttempt());

        persistenceService.processLifecycleEvent(event);
    }

    @KafkaListener(
            topics = "${job.dead-topic:dead}",
            groupId = "job-dead-consumer-group",
            containerFactory = "jobDeadEventListenerContainerFactory"
    )
    public void consumeDeadEvent(JobDeadEvent event) {
        log.warn("Received dead letter event: runId={}, jobId={}, attempt={}/{}, error='{}'",
                event.getRunId(), event.getJobId(), event.getAttempt(), event.getMaxRetries(), event.getErrorMsg());

        persistenceService.processDeadEvent(event);
    }
}
