package com.zensys.job_service.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.zensys.job_service.dto.CreateJobRequest;
import com.zensys.job_service.event.JobCreatedEvent;
import com.zensys.job_service.kafka.JobProducer;
import com.zensys.job_service.model.JobStatus;

@Service
public class JobService {

    @Autowired
    private JobProducer jobProducer;

    public String createJob(CreateJobRequest request) {

        JobCreatedEvent event = JobCreatedEvent.builder()
                .name(request.getName())
                .scheduleType(request.getScheduleType())
                .status(JobStatus.SCHEDULED)
                .scheduleTime(request.getScheduleTime())
                .cronExpression(request.getCronExpression())
                .payload(request.getPayload())
                .retries(request.getRetries() != null ? request.getRetries() : 3)
                .meta(request.getMeta())
                .build();

        jobProducer.sendJobCreatedEvent(event);

        return "Job created successfully";
    }
}
