package com.zensys.job_search_service.dto;

import java.time.Instant;

import com.zensys.job_search_service.model.JobStatus;
import com.zensys.job_search_service.model.ScheduleType;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class JobResponse {

    private String jobId;

    private String name;

    private ScheduleType scheduleType;

    private JobStatus status;

    private Instant scheduleTime;

    private String cronExpression;

    private String payload;

    private Integer retries;

    private String meta;
}
