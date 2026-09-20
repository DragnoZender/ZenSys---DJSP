package com.zensys.job_search_service.dto;

import java.time.Instant;

import com.zensys.job_search_service.model.JobRunStatus;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JobRunResponse {

    private Long id;
    private String runId;
    private String jobId;
    private JobRunStatus status;
    private Instant startTime;
    private Instant endTime;
    private Instant modificationTime;
    private String executorId;
    private Integer attemptNumber;
    private Long executionTimeMs;
    private String errorMsg;
}
