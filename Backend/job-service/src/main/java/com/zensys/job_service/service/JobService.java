package com.zensys.job_service.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.github.f4b6a3.ulid.UlidCreator;
import com.zensys.job_service.dto.CreateJobRequest;
import com.zensys.job_service.dto.UpdateJobRequest;
import com.zensys.job_service.event.JobCommand;
import com.zensys.job_service.kafka.JobProducer;
import com.zensys.job_service.model.JobCommandType;
import com.zensys.job_service.model.JobStatus;

@Service
public class JobService {

    @Autowired
    private JobProducer jobProducer;

    public String createJob(CreateJobRequest request) {

        String jobID = UlidCreator.getUlid().toString();
        String eventId = UlidCreator.getUlid().toString();

        JobCommand command = JobCommand.builder()
        .type(JobCommandType.CREATE)
        .eventId(eventId)
        .jobId(jobID)
        .name(request.getName())
        .scheduleType(request.getScheduleType())
        .status(JobStatus.SCHEDULED)
        .scheduleTime(request.getScheduleTime())
        .cronExpression(request.getCronExpression())
        .payload(request.getPayload())
        .retries(request.getRetries() != null ? request.getRetries() : 3)
        .meta(request.getMeta())
        .build();

        jobProducer.sendJobCommand(command);

        return "Job created successfully";
    }

    public String updateJob(String jobId, UpdateJobRequest request) {
 
        String eventId = UlidCreator.getUlid().toString();

        JobCommand command = JobCommand.builder()
            .type(JobCommandType.UPDATE)
            .eventId(eventId)
            .jobId(jobId)
            .name(request.getName())
            .scheduleType(request.getScheduleType())
            .status(request.getStatus())
            .scheduleTime(request.getScheduleTime())
            .cronExpression(request.getCronExpression())
            .payload(request.getPayload())
            .retries(request.getRetries() != null? request.getRetries(): 3)
            .meta(request.getMeta())
            .build();

        jobProducer.sendJobCommand(command);

        return "Job updated successfully";
    }
    
    public String deleteJob(String jobId) {

        String eventId = UlidCreator.getUlid().toString();

        JobCommand command = JobCommand.builder()
            .type(JobCommandType.DELETE)
            .eventId(eventId)
            .jobId(jobId)
            .build();

        jobProducer.sendJobCommand(command);

        return "Job deleted successfully";
    }
}
