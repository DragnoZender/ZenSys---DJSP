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
public class JobRunMessage { // {Incomming Job runs from watcher-service } mapped to watcher-service
                             // JobRunEvent class

    private String runId;
    private String jobId;
    private String payload;
    private Integer attempt;
    private Instant scheduledAt;
    private Integer maxRetries;
}
