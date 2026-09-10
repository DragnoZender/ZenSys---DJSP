package com.zensys.executor_service.dto;

import java.time.Instant;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class JobRunLifecycleEvent {

    private String eventId;
    private String runId;
    private String jobId;
    private JobRunStatus status;
    private Integer attempt;
    private String executorId;
    private String errorMsg;
    private Long executionTimeMs;
    private Instant timestamp;
}
