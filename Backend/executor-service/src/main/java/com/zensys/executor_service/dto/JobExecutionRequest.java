package com.zensys.executor_service.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class JobExecutionRequest { // Incomming from job-consumer-service

    private String runId;
    private String jobId;
    private String payload;
    private Integer attempt;
    private Integer maxRetries;
}
