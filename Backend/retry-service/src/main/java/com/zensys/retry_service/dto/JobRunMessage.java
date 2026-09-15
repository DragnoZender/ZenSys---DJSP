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
public class JobRunMessage {

    private String runId;
    private String jobId;
    private String payload;
    private Integer attempt;
    private Instant scheduledAt;
    private Integer maxRetries;
}
