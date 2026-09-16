package com.zensys.consumer_service.event;

import java.time.Instant;

import com.zensys.consumer_service.model.JobRunStatus;

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
    private Instant scheduledAt;
    private Instant timestamp;
}
