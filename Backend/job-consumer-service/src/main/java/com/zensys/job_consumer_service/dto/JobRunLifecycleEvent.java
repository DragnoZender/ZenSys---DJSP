package com.zensys.job_consumer_service.dto;

import java.time.Instant;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class JobRunLifecycleEvent { // Outgoing to Kafka topic job-run-events

    private String eventId;
    private String runId;
    private String jobId;
    private JobRunStatus status;
    private Integer attempt;
    private Instant scheduledAt;
    private Instant timestamp;
    private String executorId;
    private String errorMsg;
    private Long executionTimeMs;
}
