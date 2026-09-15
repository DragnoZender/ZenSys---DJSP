package com.zensys.retry_service.dto;

import java.time.Instant;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DelayedRetryItem {

    private String retryId;
    private String originalRunId;
    private String jobId;
    private String payload;
    private Integer attempt;
    private Integer maxRetries;
    private Long retryDelaySeconds;
    private Long dueTimestampMs;
    private Instant createdAt;
}
