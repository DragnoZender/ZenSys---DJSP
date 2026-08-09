package com.zensys.job_service.dto;

import java.time.Instant;

import com.zensys.job_service.model.JobStatus;
import com.zensys.job_service.model.ScheduleType;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UpdateJobRequest {

    private String name;

    private ScheduleType scheduleType;

    private JobStatus status;

    private Instant scheduleTime;

    private String cronExpression;

    private String payload;

    private Integer retries;

    private String meta;
}
