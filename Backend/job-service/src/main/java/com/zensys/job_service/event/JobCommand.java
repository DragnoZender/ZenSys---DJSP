package com.zensys.job_service.event;

import java.time.Instant;

import com.zensys.job_service.model.JobCommandType;
import com.zensys.job_service.model.JobStatus;
import com.zensys.job_service.model.ScheduleType;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class JobCommand {

    private String eventId;

    private String jobId;

    private JobCommandType type;

    private String name;

    private ScheduleType scheduleType;

    private JobStatus status;

    private Instant scheduleTime;

    private String cronExpression;

    private String payload;

    private Integer retries;

    private String meta;
}
